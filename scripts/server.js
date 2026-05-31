require('dotenv').config();
const express = require('express');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

const { runFixEngine } = require('./fix-engine');
const { closeLoop } = require('./close-loop');
const { createJob, updateJob } = require('./insforge');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Global bus — every fix job emits here; /events subscribers fan out from it.
const bus = new EventEmitter();
bus.setMaxListeners(0);

// ASSUMPTION: Shreyash's payload does NOT yet include `line` and `bad_code`.
// The current fix engine requires both to inject the bad line into the cloned
// repo. Until Shreyash extends the payload (or we fetch the PR diff via GitHub),
// fall back to the planted demo values when the file matches the demo path.
// Mark this clearly so a human verifies before the live demo.
const DEMO_FALLBACK = {
  file: 'demo-repo/src/payment.js',
  line: 21,
  bad_code: "  logger.debug('Payment card data', { cardNumber: pan, amount, currency })",
};

function mapPayloadToViolation(payload) {
  const v = payload && payload.violation;
  if (!v || !v.file || !v.reason) {
    return { error: 'violation.file and violation.reason are required' };
  }

  // Use provided line/bad_code if present, otherwise fall back to demo planted values
  // ASSUMPTION: matching by file path is enough to know we're in the demo flow
  const usingFallback = v.file === DEMO_FALLBACK.file && (!v.line || !v.bad_code);

  return {
    violation: {
      file: v.file,
      rule: v.reason,
      line: v.line || (usingFallback ? DEMO_FALLBACK.line : null),
      bad_code: v.bad_code || (usingFallback ? DEMO_FALLBACK.bad_code : null),
    },
    usingFallback,
  };
}

// ---- GET /health -----------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'pr-guardian-fix-engine',
    time: new Date().toISOString(),
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      daytona: !!process.env.DAYTONA_API_KEY && process.env.DAYTONA_API_KEY !== 'your_api_key_here',
      tigris: !!process.env.TIGRIS_ACCESS_KEY_ID && !!process.env.TIGRIS_BUCKET_NAME,
    },
  });
});

// ---- GET /events  (SSE fan-out for Nandan's screen) ------------------------
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ event: 'connected', time: new Date().toISOString() });

  const onEvent = (evt) => send(evt);
  bus.on('fix-event', onEvent);

  // heartbeat so proxies / browsers do not close the stream
  const hb = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(hb);
    bus.off('fix-event', onEvent);
  });
});

// ---- POST /fix  (entry point Shreyash calls) -------------------------------
app.post('/fix', async (req, res) => {
  const { pr } = req.body || {};
  if (!pr || !pr.owner || !pr.repo || !pr.number) {
    return res.status(400).json({ error: 'pr.owner, pr.repo, and pr.number are required' });
  }

  const mapped = mapPayloadToViolation(req.body);
  if (mapped.error) {
    return res.status(400).json({ error: mapped.error });
  }
  const { violation, usingFallback } = mapped;
  if (!violation.line || !violation.bad_code) {
    return res.status(400).json({
      error:
        'violation.line and violation.bad_code are required when file is not the planted demo path. ' +
        'Either include them in the payload or extend the server to fetch them from the PR diff.',
    });
  }

  const jobId = randomUUID();

  // Stream events both to /events subscribers AND to the POST response so the
  // caller can read SSE directly off the POST if they prefer.
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const emit = (evt) => {
    const wrapped = { jobId, pr: { owner: pr.owner, repo: pr.repo, number: pr.number }, ...evt };
    bus.emit('fix-event', wrapped);
    res.write(`data: ${JSON.stringify(wrapped)}\n\n`);
  };

  // Create Insforge job row (status: processing). Null if Insforge not configured.
  const insforgeJobId = await createJob({ pr, violation: mapped.violation });
  if (insforgeJobId) emit({ event: 'insforge_job_created', insforgeJobId });

  emit({ event: 'job_accepted', violation, usingFallback, pr });

  try {
    const result = await runFixEngine(violation, { onEvent: emit, pr });

    const finalStatus = result.success ? 'fixed' : result.escalate ? 'escalated' : 'unknown';
    await updateJob(insforgeJobId, {
      status: finalStatus,
      // ASSUMPTION: receipt stored as jsonb; stringify not needed — Insforge accepts objects
      receipt: result.receipt || null,
    });

    // Hand off to Kaushik
    emit({ event: 'close_loop', status: 'starting' });
    let closeResult;
    try {
      closeResult = await closeLoop({ pr, result });
      emit({ event: 'close_loop', status: 'done', result: closeResult });
    } catch (err) {
      emit({ event: 'close_loop', status: 'error', message: err.message });
    }

    emit({
      event: 'job_complete',
      status: finalStatus,
      result,
      close_loop: closeResult,
    });
  } catch (err) {
    console.error('Fix engine failed:', err);
    await updateJob(insforgeJobId, { status: 'escalated', receipt: { error: err.message } });
    emit({ event: 'job_error', message: err.message });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PR Guardian fix engine listening on http://localhost:${PORT}`);
  console.log('  GET  /health');
  console.log('  GET  /events   (SSE)');
  console.log('  POST /fix      (SSE response)');
});
