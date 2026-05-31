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

import { mergePR, postReceipt } from "./github.js";
import { notifySlack } from "./slack.js";
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
  outcome.receipt = await postReceipt(input, body);

  // And a Slack ping so a human is always in the loop.
  outcome.slack = await notifySlack(input, outcome.merge || {});

  return outcome;
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
