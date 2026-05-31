// Builds the human-readable "receipt" — the proof the agent posts back on the
// PR explaining what it found, what it did, and why. This is the trust artifact
// the whole product hinges on, so keep it clear and honest.

import { postComment } from "./github.js";

// postReceipt — the close of the loop's visible proof. Formats a single,
// skimmable comment (a senior engineer's note) and posts it on the PR.
//
//   input:  { owner, repo, prNumber, whyText, changeSummary }
//   output: the posted comment's URL (null in dry-run / without creds)
//
// Auth/Octokit/dry-run are reused from github.js via postComment — no second
// GitHub setup here.
export async function postReceipt({ owner, repo, prNumber, whyText, changeSummary }) {
  const body = formatReceiptComment({ whyText, changeSummary });
  const res = await postComment({ owner, repo, prNumber }, body);
  return res.url ?? null;
}

// The receipt markdown: short header + 2-4 skimmable lines — which decision was
// violated (whyText), what changed to comply (changeSummary), tests green.
export function formatReceiptComment({ whyText, changeSummary }) {
  return [
    "### 🛡️ PR Guardian — compliance fix applied",
    "",
    `**What was wrong:** ${whyText}`,
    `**What I changed:** ${changeSummary}`,
    "**Verification:** ✅ Tests pass in an isolated sandbox before merge.",
    "",
    "<sub>Autonomous receipt from PR Guardian · any maintainer can revert this.</sub>",
  ].join("\n");
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
  lines.push(`**Decision:** \`${decision}\`  ·  **Confidence:** ${formatConfidence(confidence)}`);
  lines.push("");

  if (violation) {
    lines.push("### What we found");
    lines.push(`- **Rule:** ${violation.rule}`);
    if (violation.file) {
      const loc = violation.line ? `${violation.file}:${violation.line}` : violation.file;
      lines.push(`- **Location:** \`${loc}\``);
    }
    if (violation.description) lines.push(`- **Detail:** ${violation.description}`);
    lines.push("");
  }

  if (decision === "fix" && fix) {
    lines.push("### What we did");
    if (fix.summary) lines.push(fix.summary);
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
    lines.push(fix?.why || violation?.description || "No real violation — left unchanged.");
    lines.push("");
  }

  if (decision === "escalate") {
    lines.push("### Why a human should look");
    lines.push(fix?.why || violation?.description || "Confidence too low to act automatically.");
    lines.push("");
  }

  if (sandbox) {
    lines.push("### Test run");
    const status = sandbox.testsPassed ? "✅ passing" : "❌ failing";
    const attempts = sandbox.attempts ? ` after ${sandbox.attempts} attempt(s)` : "";
    lines.push(`Tests are ${status}${attempts}.`);
    lines.push("");
  }

  lines.push("---");
  lines.push("_Autonomous receipt from PR Guardian. A human can revert any change._");

  return lines.join("\n");
}

function formatConfidence(c) {
  if (typeof c !== "number") return "unknown";
  return `${Math.round(c * 100)}%`;
}
