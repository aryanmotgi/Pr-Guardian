async function route(pr, decision) {
  const { verdict, confidence, reason, file } = decision;

  console.log(`\n=== DECISION for PR #${pr.number} ===`);
  console.log(`Verdict:    ${verdict}`);
  console.log(`Confidence: ${confidence}`);
  console.log(`Reason:     ${reason}`);
  console.log(`File:       ${file || 'n/a'}`);
  console.log('=====================================\n');

  if (verdict === 'violation' && confidence === 'high') {
    console.log(`ACTION: Handing off to fix engine — PR #${pr.number} in ${file}`);
    // ASSUMPTION: Insforge/Aryan's fix engine connects here
    await handoffToFixEngine(pr, decision);
  } else if (verdict === 'false-alarm') {
    console.log(`ACTION: Allowing PR #${pr.number} — ${reason}`);
  } else {
    console.log(`ACTION: Escalating PR #${pr.number} to human — confidence too low or unsure`);
  }
}

async function handoffToFixEngine(pr, decision) {
  const payload = {
    pr: {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
    },
    violation: {
      file: decision.file,
      line: decision.line ?? null,
      bad_code: decision.bad_code ?? null,
      reason: decision.reason,
    },
  };

  console.log('Fix engine payload:', JSON.stringify(payload, null, 2));

  // POST to Aryan's fix engine. Set FIX_ENGINE_URL in .env to his server.
  const fixUrl = process.env.FIX_ENGINE_URL;
  if (!fixUrl) {
    console.warn('FIX_ENGINE_URL not set — skipping POST (payload logged above)');
    return;
  }

  try {
    const res = await fetch(`${fixUrl}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`POST ${fixUrl}/fix -> ${res.status}`);
  } catch (err) {
    // Don't crash the pipeline if Aryan's server is down — just warn
    console.warn(`Could not reach fix engine at ${fixUrl}/fix: ${err.message}`);
  }
}

module.exports = { route };
