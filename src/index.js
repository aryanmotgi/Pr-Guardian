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
import { notifySlack, sendSlack } from "./slack.js";
import { buildReceipt } from "./receipt.js";

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

  // Everyone gets a receipt — the proof of what happened and why.
  const body = buildReceipt(input);
  outcome.receipt = await postComment(
    { owner: input.repo.owner, repo: input.repo.name, prNumber: input.pr.number },
    body
  );

  // And a Slack ping so a human is always in the loop. Best-effort: a failed
  // notification must NEVER undo a completed merge — catch and record instead.
  try {
    outcome.slack = await slackPing(input, outcome);
  } catch (err) {
    console.warn("slack ping failed (non-fatal):", err.message);
    outcome.slack = { sent: false, error: err.message };
  }

  return outcome;
}

// Decision-aware Slack message. The merged case routes through notifySlack (the
// canonical one-line "Auto-fixed & merged" ping); allow/escalate send their own
// short line via the shared sendSlack primitive.
function slackPing(input, outcome) {
  const ref = `${input.repo.owner}/${input.repo.name}#${input.pr.number}`;
  const url = input.pr?.url || "";
  if (outcome.decision === "fix" && outcome.merged) {
    const summary = `${input.violation?.rule || "rule violation"} — ${input.fix?.summary || "auto-fixed"}`;
    return notifySlack({ summary, prUrl: url || ref });
  }
  if (outcome.decision === "allow") {
    return sendSlack(`✅ PR Guardian allowed ${ref} — ${input.fix?.why || "no real violation"} ${url}`.trim());
  }
  return sendSlack(`⚠️ PR Guardian escalated ${ref} for human review — ${input.violation?.description || ""} ${url}`.trim());
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
