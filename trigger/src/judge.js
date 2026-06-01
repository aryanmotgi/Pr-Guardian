const { OpenAI } = require("openai");
const { getRules, logJudgment } = require("./insforge");

// NEAR Private Inference — PR diffs processed inside hardware-secured TEE enclaves.
const client = new OpenAI({
	baseURL: "https://cloud-api.near.ai/v1",
	apiKey: process.env.NEAR_AI_API_KEY,
});

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

Respond with ONLY valid JSON in this exact format, no explanation outside the JSON:
{
  "verdict": "violation" | "false-alarm" | "unsure",
  "confidence": "high" | "low",
  "reason": "one sentence explaining the decision",
  "file": "the filename where the issue was found, or null",
  "line": 23,
  "bad_code": "the exact bad line of code, or null"
}`;

	const message = await client.chat.completions.create({
		model: "Qwen/Qwen3.5-122B-A10B",
		max_tokens: 256,
		messages: [{ role: "user", content: prompt }],
	});

	const text = message.choices[0].message.content.trim();

	// Strip markdown code fences if present
	const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

	const result = JSON.parse(jsonText);

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
