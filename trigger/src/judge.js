const Anthropic = require("@anthropic-ai/sdk");
const { getRules, logJudgment } = require("./insforge");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

async function judge(diff) {
	const ruleDescriptions = await getRules();
	const RULES = ruleDescriptions.map((r, i) => `${i + 1}. ${r}`).join("\n");

	const diffText = diff.files
		.map((f) => `--- ${f.filename} ---\n${f.patch}`)
		.join("\n\n");

	const prompt = `/no_think
You are a security agent reviewing a GitHub pull request diff.

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

	const message = await client.messages.create({
		model: "claude-haiku-4-5-20251001",
		max_tokens: 512,
		messages: [{ role: "user", content: prompt }],
	});

	const raw = message.content[0].text.trim();
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error(`No JSON found in response: ${raw.slice(0, 200)}`);

	const result = JSON.parse(jsonMatch[0]);

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
