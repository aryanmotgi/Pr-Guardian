// The merge stage — the back half of the core loop.
//
//   ...agent decides + fixes + tests pass...  ──▶  runMergeStage(input)
//                                                     ├─ fix:      merge → receipt → slack
//                                                     ├─ allow:    receipt → slack (no merge)
//                                                     └─ escalate: receipt → slack (no merge)
//
// Input contract is documented in fixtures.js. This module is decision-aware so
// it correctly handles all three branches of the confidence gate — critically,
// it must NOT merge on "allow" or "escalate".

import { mergePR, postComment } from "./github.js";
import { notifySlack } from "./slack.js";
import { buildReceipt, postReceipt } from "./receipt.js";
import { config } from "./config.js";

export async function runMergeStage(input) {
  validate(input);
  const { decision, sandbox } = input;
  const outcome = { decision, merged: false, receipt: null, slack: null };

  // Safety gate: only ever merge a real, tested fix. A wrong merge is worse
  // than an escalation (CLAUDE.md).
  if (decision === "fix") {
    if (!sandbox?.testsPassed) {
      throw new Error(
        "Refusing to merge: decision is 'fix' but sandbox.testsPassed is not true."
      );
    }
    outcome.merge = await mergePR(input);
    outcome.merged = Boolean(outcome.merge?.merged);
  }

  // Receipt — the proof. Content differs by outcome: fix keeps its existing rich
  // receipt (unchanged); allow/escalate post outcome-specific receipts.
  outcome.receipt = await postReceiptForOutcome(input);

  // Slack — tone differs by outcome. Best-effort: a failed notification must
  // NEVER undo a completed merge — catch and record instead.
  try {
    outcome.slack = await slackForOutcome(input, outcome);
  } catch (err) {
    console.warn("slack ping failed (non-fatal):", err.message);
    outcome.slack = { sent: false, error: err.message };
  }

  return outcome;
}

const targetOf = (input) => ({
  owner: input.repo.owner,
  repo: input.repo.name,
  prNumber: input.pr.number,
});

// FIX keeps its existing rich receipt (buildReceipt). ALLOW and ESCALATE get
// distinct, outcome-specific receipts via the shared postReceipt.
async function postReceiptForOutcome(input) {
  const target = targetOf(input);

  if (input.decision === "fix") {
    return postComment(target, buildReceipt(input)); // unchanged
  }

  if (input.decision === "allow") {
    const url = await postReceipt({
      ...target,
      outcome: "allow",
      whyText: input.fix?.why || input.violation?.description || "Reviewed — compliant.",
    });
    return { url };
  }

  // escalate
  const url = await postReceipt({
    ...target,
    outcome: "escalate",
    rule: input.violation?.rule,
    whyText: input.fix?.why || input.violation?.description,
  });
  return { url };
}

// FIX → the green "Auto-fixed & merged" card (unchanged). ALLOW → a quiet,
// no-alert ping. ESCALATE → a warning alert that @-mentions a human.
function slackForOutcome(input) {
  const ref = `${input.repo.owner}/${input.repo.name}#${input.pr.number}`;
  const prUrl = input.pr?.url || ref;

  if (input.decision === "fix") {
    const summary = `${input.violation?.rule || "rule violation"} — ${input.fix?.summary || "auto-fixed"}`;
    return notifySlack({ summary, prUrl });
  }

  if (input.decision === "allow") {
    const summary = `${ref} — ${input.fix?.why || "no real violation"}`;
    return notifySlack({ outcome: "allow", summary, prUrl });
  }

  // escalate
  const summary = `${ref} — ${input.violation?.description || input.violation?.rule || "needs review"}`;
  return notifySlack({
    outcome: "escalate",
    summary,
    prUrl,
    mention: config.slack.escalationMention,
    rule: input.violation?.rule,
    severity: input.severity || deriveSeverity(input.violation?.rule),
  });
}

// Triage severity for an escalation. Honour an explicit input.severity from the
// brain; otherwise infer from the rule — anything touching secrets/credentials
// or sensitive PII is HIGH, everything else MEDIUM.
function deriveSeverity(rule = "") {
  return /secret|api key|password|card|pan|ssn|pii|credential|token/i.test(rule)
    ? "high"
    : "medium";
}

function validate(input) {
  if (!input || typeof input !== "object") throw new Error("merge stage: input required");
  const valid = ["fix", "allow", "escalate"];
  if (!valid.includes(input.decision)) {
    throw new Error(`merge stage: decision must be one of ${valid.join(" | ")}`);
  }
  if (!input.repo?.owner || !input.repo?.name) {
    throw new Error("merge stage: input.repo {owner, name} required");
  }
  if (!input.pr?.number) throw new Error("merge stage: input.pr.number required");
}
