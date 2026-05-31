// Builds the human-readable "receipt" — the proof the agent posts back on the
// PR explaining what it found, what it did, and why. This is the trust artifact
// the whole product hinges on, so keep it clear and honest.

import { postComment } from "./github.js";

// postReceipt — the close of the loop's visible proof. Formats a single,
// skimmable comment (a senior engineer's note) and posts it on the PR.
//
//   input:  { owner, repo, prNumber, whyText, changeSummary, diff? }
//   output: the posted comment's URL (null in dry-run / without creds)
//
// `diff` is optional (a unified diff of the rewrite). When present it's shown in
// a collapsible before/after block — the strongest proof the agent actually
// changed code. Omitting it falls back to the plain receipt, so existing callers
// are unaffected.
//
// Auth/Octokit/dry-run are reused from github.js via postComment — no second
// GitHub setup here.
/**
 * @param {{ owner: string, repo: string, prNumber: number, whyText?: string, changeSummary?: string, diff?: string, outcome?: string, rule?: string }} params
 */
export async function postReceipt({
	owner,
	repo,
	prNumber,
	whyText,
	changeSummary,
	diff,
	outcome = "fix",
	rule,
}) {
	const body = formatReceiptComment({
		outcome,
		whyText,
		changeSummary,
		diff,
		rule,
	});
	const res = await postComment({ owner, repo, prNumber }, body);
	return res.url ?? null;
}

// The receipt markdown, by outcome:
//   fix      → what was wrong / what changed / tests green (+ optional diff)
//   allow    → a short, quiet "reviewed — compliant, no action needed"
//   escalate → flags it for a human and names the rule that was violated
// The fix template is the default and is unchanged.
/**
 * @param {{ outcome?: string, whyText?: string, changeSummary?: string, diff?: string, rule?: string }} params
 */
export function formatReceiptComment({
	outcome = "fix",
	whyText,
	changeSummary,
	diff,
	rule,
}) {
	if (outcome === "allow") {
		return [
			"### ✅ PR Guardian — Reviewed: compliant, no action needed",
			"",
			whyText || "Reviewed this change against our rules — nothing to fix.",
			"",
			"<sub>Autonomous receipt from PR Guardian · no changes were made.</sub>",
		].join("\n");
	}

	if (outcome === "escalate") {
		const out = [
			"### ⚠️ PR Guardian — Caught a violation I couldn't auto-fix safely — needs human review",
			"",
			`**Rule violated:** ${rule || "(unspecified)"}`,
		];
		if (whyText) out.push(`**Why a human is needed:** ${whyText}`);
		out.push(
			"",
			"<sub>Autonomous receipt from PR Guardian · not merged — awaiting a human.</sub>",
		);
		return out.join("\n");
	}

	// outcome === "fix" (default) — unchanged
	const lines = [
		"### 🛡️ PR Guardian — compliance fix applied",
		"",
		`**What was wrong:** ${whyText}`,
		`**What I changed:** ${changeSummary}`,
		"**Verification:** ✅ Tests pass in an isolated sandbox before merge.",
	];

	if (diff?.trim()) {
		lines.push(
			"",
			"<details><summary>📝 Before / after — view the change</summary>",
			"",
			"```diff",
			diff.trim(),
			"```",
			"",
			"</details>",
		);
	}

	lines.push(
		"",
		"<sub>Autonomous receipt from PR Guardian · any maintainer can revert this.</sub>",
	);
	return lines.join("\n");
}

const DECISION_HEADERS = {
	fix: "🛡️ PR Guardian — Violation fixed & merged",
	allow: "✅ PR Guardian — Reviewed, no action needed",
	escalate: "⚠️ PR Guardian — Escalated to a human",
};

// input: the merge-stage contract (see fixtures.js for the shape).
// Returns a markdown string suitable for a PR comment.
export function buildReceipt(input) {
	const { decision, confidence, violation, fix, sandbox } = input;
	const lines = [];

	lines.push(`## ${DECISION_HEADERS[decision] || "PR Guardian"}`);
	lines.push("");
	lines.push(
		`**Decision:** \`${decision}\`  ·  **Confidence:** ${formatConfidence(confidence)}`,
	);
	lines.push("");

	if (violation) {
		lines.push("### What we found");
		lines.push(`- **Rule:** ${violation.rule}`);
		if (violation.file) {
			const loc = violation.line
				? `${violation.file}:${violation.line}`
				: violation.file;
			lines.push(`- **Location:** \`${loc}\``);
		}
		if (violation.description)
			lines.push(`- **Detail:** ${violation.description}`);
		lines.push("");
	}

	if (decision === "fix" && fix) {
		lines.push("### What we did");
		if (fix.summary) lines.push(fix.summary);
		if (Number.isFinite(fix.timeMs)) {
			lines.push("");
			lines.push(`_Fixed in ${(fix.timeMs / 1000).toFixed(1)}s._`);
		}
		if (fix.why) {
			lines.push("");
			lines.push(`**Why this is safe:** ${fix.why}`);
		}
		if (fix.diff) {
			lines.push("");
			lines.push("<details><summary>View the change</summary>");
			lines.push("");
			lines.push("```diff");
			lines.push(fix.diff.trim());
			lines.push("```");
			lines.push("");
			lines.push("</details>");
		}
		lines.push("");
	}

	if (decision === "allow") {
		lines.push("### Why we allowed it");
		lines.push(
			fix?.why ||
				violation?.description ||
				"No real violation — left unchanged.",
		);
		lines.push("");
	}

	if (decision === "escalate") {
		lines.push("### Why a human should look");
		lines.push(
			fix?.why ||
				violation?.description ||
				"Confidence too low to act automatically.",
		);
		lines.push("");
	}

	if (sandbox) {
		lines.push("### Test run");
		const status = sandbox.testsPassed ? "✅ passing" : "❌ failing";
		const attempts = sandbox.attempts
			? ` after ${sandbox.attempts} attempt(s)`
			: "";
		lines.push(`Tests are ${status}${attempts}.`);
		lines.push("");
	}

	lines.push("---");
	lines.push(
		"_Autonomous receipt from PR Guardian. A human can revert any change._",
	);

	return lines.join("\n");
}

function formatConfidence(c) {
	if (typeof c !== "number") return "unknown";
	return `${Math.round(c * 100)}%`;
}
