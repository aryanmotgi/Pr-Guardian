require("dotenv").config();

// Required tables — run once in Insforge dashboard:
//
// CREATE TABLE rules (
//   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   name        text NOT NULL,
//   description text NOT NULL,
//   enabled     boolean NOT NULL DEFAULT true,
//   created_at  timestamptz NOT NULL DEFAULT now()
// );
//
// Seed rows (run once):
// INSERT INTO rules (name, description) VALUES
//   ('no-pan-logging',       'Never log or print full payment card numbers (PANs) in application code.'),
//   ('no-pii-logging',       'Never log other sensitive PII (full SSNs, passwords, full card data) in app code.'),
//   ('no-hardcoded-secrets', 'No hardcoded secrets or API keys committed in source.');

const FALLBACK_RULES = [
	"Never log or print full payment card numbers (PANs) in application code.",
	"Never log other sensitive PII (full SSNs, passwords, full card data) in app code.",
	"No hardcoded secrets or API keys committed in source.",
];

// @insforge/sdk ships ESM-only (shared-schemas dep has no CJS export).
// Use dynamic import() from this CJS file to bridge the gap.
async function getClient() {
	if (!process.env.INSFORGE_URL || !process.env.INSFORGE_ANON_KEY) return null;
	const { createClient } = await import("@insforge/sdk");
	return createClient({
		baseUrl: process.env.INSFORGE_URL,
		anonKey: process.env.INSFORGE_ANON_KEY,
	});
}

async function getRules() {
	const client = await getClient();
	if (!client) {
		console.log("Insforge not configured — using fallback rules.");
		return FALLBACK_RULES;
	}

	const { data, error } = await client.database
		.from("rules")
		.select("description")
		.eq("enabled", true);

	if (error) {
		console.warn("Insforge getRules failed:", error.message, "— using fallback.");
		return FALLBACK_RULES;
	}

	const remote = data.map((r) => r.description);
	return remote.length ? remote : FALLBACK_RULES;
}

// Publish a violation_detected event to the 'violations' realtime channel.
async function fireViolationEvent(violation, pr) {
	const client = await getClient();
	if (!client) {
		console.log("Insforge not configured — skipping fireViolationEvent.");
		return;
	}

	try {
		await client.realtime.connect();
		const sub = await client.realtime.subscribe("violations");
		if (!sub.ok) {
			console.warn("Insforge realtime subscribe failed:", sub.error?.message);
			return;
		}
		await client.realtime.publish("violations", "violation_detected", {
			pr_number: pr.number,
			repo: pr.repo,
			owner: pr.owner,
			file: violation.file,
			line: violation.line ?? null,
			bad_code: violation.bad_code ?? null,
			reason: violation.reason,
			timestamp: new Date().toISOString(),
		});
		console.log(`Insforge violation event fired for PR #${pr.number}`);
	} catch (err) {
		console.warn("Insforge fireViolationEvent failed:", err.message);
	}
}

// Log every AI judgment to the judgments table as an immutable audit trail.
async function logJudgment(judgment) {
	const client = await getClient();
	if (!client) return;
	try {
		await client.database.from("judgments").insert({
			verdict: judgment.verdict,
			confidence: judgment.confidence,
			reason: judgment.reason,
			file: judgment.file,
			line: judgment.line,
			model: "Qwen/Qwen3.5-122B-A10B",
		});
	} catch {
		// fire-and-forget — don't block judgment flow if table doesn't exist
	}
}

module.exports = { getRules, fireViolationEvent, logJudgment };
