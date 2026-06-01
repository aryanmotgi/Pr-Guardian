const { OpenAI } = require("openai");
const { getRules, logJudgment } = require("./insforge");

// NEAR Private Inference — diffs processed in hardware TEE enclaves.
const client = new OpenAI({
	baseURL: "https://cloud-api.near.ai/v1",
	apiKey: process.env.NEAR_AI_API_KEY,
});

function extractVerdict(text) {
	const starts = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "{") starts.push(i);
	}
	for (let i = starts.length - 1; i >= 0; i--) {
		let depth = 0, end = -1;
		for (let j = starts[i]; j < text.length; j++) {
			if (text[j] === "{") depth++;
			else if (text[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
		}
		if (end === -1) continue;
		try {
			const parsed = JSON.parse(text.slice(starts[i], end + 1));
			if (parsed.verdict) return parsed;
		} catch { continue; }
	}
	return null;
}

async function judge(diff) {
	const ruleDescriptions = await getRules();
	const RULES = ruleDescriptions.map((r, i) => `${i + 1}. ${r}`).join("\n");

	const diffText = diff.files
		.map((f) => `--- ${f.filename} ---\n${f.patch}`)
		.join("\n\n");

	const prompt = `You are a security agent reviewing a GitHub pull request diff.

RULES:
${RULES}

IMPORTANT CONTEXT RULES:
- If a card number appears ONLY in a test file (*.test.js, *.spec.js, tests/, __tests__/) as test fixture data, that is NOT a violation. Test cards like 4242424242424242 are published Stripe fixtures — allow them.
- Only flag violations in application/production code.

PR DIFF:
${diffText}

When verdict is "violation", also pinpoint exactly where the problem is:
- "line": the line number in the NEW version of the file where the bad code is. Read the diff hunk header (e.g. "@@ -20,6 +20,7 @@" means the new block starts at line 20) and count down through the context/added lines to find it. If you cannot determine it, use null.
- "bad_code": the exact offending line of code, copied verbatim from the diff (without the leading "+").

Respond with ONLY valid JSON, no explanation outside the JSON. Use exactly this structure:
{
  "verdict": "violation",
  "confidence": "high",
  "reason": "one sentence explaining the decision",
  "file": "src/example.js",
  "line": 23,
  "bad_code": "the exact bad line of code"
}

verdict must be one of: violation, false-alarm, unsure
confidence must be one of: high, low
file and bad_code must be null when verdict is not violation`;

	const message = await client.chat.completions.create({
		model: "Qwen/Qwen3.5-122B-A10B",
		max_tokens: 2048,
		messages: [
			{ role: "system", content: "You are a JSON-only security agent. Output ONLY valid JSON with no preamble, no thinking, no explanation." },
			{ role: "user", content: prompt },
		],
		extra_body: { enable_thinking: false },
	});

	const msg = message.choices[0].message;
	const raw = (msg.content ?? msg.reasoning_content ?? "").trim();

	// Qwen3 thinking pollutes the response with {braces} — scan every '{' from
	// last to first and return the first candidate that parses as valid JSON with a verdict.
	const result = extractVerdict(raw);
	if (!result) throw new Error(`No valid verdict JSON in response: ${raw.slice(0, 200)}`);

	if (!["violation", "false-alarm", "unsure"].includes(result.verdict)) {
		throw new Error(`Unexpected verdict: ${result.verdict}`);
	}
	if (!["high", "low"].includes(result.confidence)) {
		throw new Error(`Unexpected confidence: ${result.confidence}`);
	}

	logJudgment(result).catch(() => {});
	return result;
}

module.exports = { judge };
