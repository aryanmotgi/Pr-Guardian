require("dotenv").config();
const express = require("express");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");

const { runFixEngine } = require("./fix-engine");
const { closeLoop } = require("./close-loop");
const { createJob, updateJob } = require("./insforge");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	if (req.method === "OPTIONS") return res.sendStatus(204);
	next();
});

// Global bus — every fix job emits here; /events subscribers fan out from it.
const bus = new EventEmitter();
bus.setMaxListeners(0);

// ASSUMPTION: Shreyash's payload does NOT yet include `line` and `bad_code`.
// The current fix engine requires both to inject the bad line into the cloned
// repo. Until Shreyash extends the payload (or we fetch the PR diff via GitHub),
// fall back to the planted demo values when the file matches the demo path.
// Mark this clearly so a human verifies before the live demo.
const DEMO_FALLBACK = {
	file: "demo-repo/src/payment.js",
	line: 21,
	bad_code:
		"  logger.debug('Payment card data', { cardNumber: pan, amount, currency })",
};

function mapPayloadToViolation(payload) {
	const v = payload?.violation;
	if (!v?.file || !v.reason) {
		return { error: "violation.file and violation.reason are required" };
	}

	// Use provided line/bad_code if present, otherwise fall back to demo planted values
	// ASSUMPTION: matching by file path is enough to know we're in the demo flow
	const usingFallback =
		v.file === DEMO_FALLBACK.file && (!v.line || !v.bad_code);

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
app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		service: "pr-guardian-fix-engine",
		time: new Date().toISOString(),
		env: {
			anthropic: !!process.env.ANTHROPIC_API_KEY,
			daytona:
				!!process.env.DAYTONA_API_KEY &&
				process.env.DAYTONA_API_KEY !== "your_api_key_here",
			tigris:
				!!process.env.TIGRIS_ACCESS_KEY_ID && !!process.env.TIGRIS_BUCKET_NAME,
		},
	});
});

// ---- GET /events  (SSE fan-out for Nandan's screen) ------------------------
app.get("/events", (req, res) => {
	res.set({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	res.flushHeaders();

	const send = (payload) => {
		res.write(`data: ${JSON.stringify(payload)}\n\n`);
	};

	send({ event: "connected", time: new Date().toISOString() });

	const onEvent = (evt) => send(evt);
	bus.on("fix-event", onEvent);

	// heartbeat so proxies / browsers do not close the stream
	const hb = setInterval(() => res.write(": ping\n\n"), 15000);

	req.on("close", () => {
		clearInterval(hb);
		bus.off("fix-event", onEvent);
	});
});

// ---- POST /fix  (entry point Shreyash calls) -------------------------------
app.post("/fix", async (req, res) => {
	const { pr } = req.body || {};
	if (!pr?.owner || !pr.repo || !pr.number) {
		return res
			.status(400)
			.json({ error: "pr.owner, pr.repo, and pr.number are required" });
	}

	const mapped = mapPayloadToViolation(req.body);
	if (mapped.error) {
		return res.status(400).json({ error: mapped.error });
	}
	const { violation, usingFallback } = mapped;
	if (!violation.line || !violation.bad_code) {
		return res.status(400).json({
			error:
				"violation.line and violation.bad_code are required when file is not the planted demo path. " +
				"Either include them in the payload or extend the server to fetch them from the PR diff.",
		});
	}

	const jobId = randomUUID();

	// Stream events both to /events subscribers AND to the POST response so the
	// caller can read SSE directly off the POST if they prefer.
	res.set({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	res.flushHeaders();

	const emit = (evt) => {
		const wrapped = {
			jobId,
			pr: { owner: pr.owner, repo: pr.repo, number: pr.number },
			...evt,
		};
		bus.emit("fix-event", wrapped);
		res.write(`data: ${JSON.stringify(wrapped)}\n\n`);
	};

	// Create Insforge job row (status: processing). Null if Insforge not configured.
	const insforgeJobId = await createJob({ pr, violation: mapped.violation });
	if (insforgeJobId) emit({ event: "insforge_job_created", insforgeJobId });

	emit({ event: "job_accepted", violation, usingFallback, pr });

	try {
		const result = await runFixEngine(violation, { onEvent: emit, pr });

		const finalStatus = result.success
			? "fixed"
			: result.escalate
				? "escalated"
				: "unknown";
		await updateJob(insforgeJobId, {
			status: finalStatus,
			// ASSUMPTION: receipt stored as jsonb; stringify not needed — Insforge accepts objects
			receipt: result.receipt || null,
		});

		// Hand off to Kaushik
		emit({ event: "close_loop", status: "starting" });
		let closeResult;
		try {
			closeResult = await closeLoop({ pr, result });
			emit({ event: "close_loop", status: "done", result: closeResult });
		} catch (err) {
			emit({ event: "close_loop", status: "error", message: err.message });
		}

		emit({
			event: "job_complete",
			status: finalStatus,
			result,
			close_loop: closeResult,
		});
	} catch (err) {
		console.error("Fix engine failed:", err);
		await updateJob(insforgeJobId, {
			status: "escalated",
			receipt: { error: err.message },
		});
		emit({ event: "job_error", message: err.message });
	} finally {
		res.end();
	}
});

// ---- POST /demo-scenario  (scripted demo events — allow / escalate) --------
// Fires pre-canned SSE events with realistic delays so the live screen shows
// the full outcome without running a real sandbox. Returns 202 immediately.
app.post("/demo-scenario", (req, res) => {
	const { scenario, pr } = req.body || {};
	if (!["allow", "escalate"].includes(scenario) || !pr?.number) {
		return res.status(400).json({ error: "scenario ('allow'|'escalate') and pr.number required" });
	}

	const jobId   = randomUUID();
	const runId   = jobId;
	const prNum   = pr.number;
	const prTitle = pr.title || `Demo PR #${prNum}`;

	// Emits directly in frontend PipelineEvent format — bypasses normalizeRenderEvent.
	// runId + prNumber are the identity keys the reducer uses.
	const emit = (evt) => {
		bus.emit("fix-event", { runId, prNumber: prNum, prTitle, ...evt });
	};

	res.status(202).json({ jobId, scenario, prNumber: prNum });

	const delay = (ms) => new Promise((r) => setTimeout(r, ms));

	async function runAllow() {
		emit({ type: "step", step: "trigger",  status: "pass",    message: "Webhook received — PR opened" });
		await delay(800);
		emit({ type: "step", step: "decide",   status: "running", message: "Reading diff and context…" });
		await delay(2200);
		emit({ type: "step", step: "decide",   status: "pass",    message: "HIGH confidence — Stripe test card in test file, not production code" });
		await delay(600);
		emit({ type: "decision", decision: "allow" });
		await delay(400);
		emit({ type: "step", step: "receipt",  status: "pass",    message: "Decision logged — no action required" });
		await delay(500);
		emit({ type: "step", step: "slack",    status: "pass",    message: "Slack notified: #security-alerts — false alarm" });
		await delay(300);
		emit({ type: "done" });
	}

	async function runEscalate() {
		emit({ type: "step", step: "trigger", status: "pass",    message: "Webhook received — PR opened" });
		await delay(800);
		emit({ type: "step", step: "decide",  status: "running", message: "Analyzing violation…" });
		await delay(2000);
		emit({ type: "step", step: "decide",  status: "pass",    message: "MEDIUM confidence — hardcoded secret key, context unclear" });
		await delay(500);

		// Attempt 1
		emit({ type: "step", step: "fix",   status: "running", message: "Attempt 1/3 — asking Claude…" });
		await delay(3000);
		emit({ type: "step", step: "test",  status: "running", message: "Running tests in sandbox…" });
		await delay(2000);
		emit({ type: "step", step: "test",  status: "fail",    message: "Tests FAILED — key rotation logic broken" });
		await delay(600);
		emit({ type: "step", step: "retry", status: "running", message: "Attempt 2/3 — sending failure context to Claude…" });

		// Attempt 2
		await delay(3000);
		emit({ type: "step", step: "fix",   status: "running", message: "Attempt 2/3 — asking Claude…" });
		await delay(2500);
		emit({ type: "step", step: "test",  status: "running", message: "Running tests in sandbox…" });
		await delay(2000);
		emit({ type: "step", step: "test",  status: "fail",    message: "Tests FAILED — decryption mismatch" });
		await delay(600);
		emit({ type: "step", step: "retry", status: "running", message: "Attempt 3/3 — last attempt…" });

		// Attempt 3
		await delay(3000);
		emit({ type: "step", step: "fix",   status: "running", message: "Attempt 3/3 — asking Claude…" });
		await delay(2500);
		emit({ type: "step", step: "test",  status: "running", message: "Running tests in sandbox…" });
		await delay(2000);
		emit({ type: "step", step: "test",  status: "fail",    message: "Tests FAILED — max attempts reached" });
		await delay(600);
		emit({ type: "step", step: "fix",   status: "fail",    message: "Could not produce a safe fix — escalating to human" });
		await delay(400);
		emit({ type: "decision", decision: "escalate" });
		await delay(400);
		emit({ type: "step", step: "slack", status: "pass",    message: "Slack ping sent — human review required" });
		await delay(300);
		emit({ type: "done" });
	}

	if (scenario === "allow")    runAllow().catch(console.error);
	if (scenario === "escalate") runEscalate().catch(console.error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`PR Guardian fix engine listening on http://localhost:${PORT}`);
	console.log("  GET  /health");
	console.log("  GET  /events   (SSE)");
	console.log("  POST /fix      (SSE response)");
	console.log("  POST /demo-scenario  (scripted allow/escalate)");
});
