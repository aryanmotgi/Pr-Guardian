// closeLoop — the single entry point for the CLOSE of the loop. Given a
// confirmed, tested fix, it runs the three close-of-loop steps in sequence:
//
//   1. merge the fix    (mergePR)      — gated: only merges on a green build
//   2. post the receipt (postReceipt)  — the visible proof of what changed & why
//   3. ping Slack        (notifySlack)  — best-effort announcement
//
// This composes the three standalone public functions Kaushik owns. For the
// decision-aware orchestrator that also handles allow/escalate from the full
// agent contract, see runMergeStage in index.js.

import { mergePR } from "./github.js";
import { postReceipt } from "./receipt.js";
import { notifySlack } from "./slack.js";

// input: {
//   owner, repo, prNumber,           // the PR to close
//   prUrl,                           // link for the receipt / Slack button
//   whyText, changeSummary,          // what was wrong / what the agent changed
//   diff?,                           // optional unified diff for the receipt
//   tests: { passed, total },        // sandbox result — the merge gate
//   title?,                          // optional merge commit title
// }
// returns: { merged, mergeSha, receiptUrl, slack }
export async function closeLoop(input) {
  validate(input);
  const { owner, repo, prNumber, prUrl, whyText, changeSummary, diff, tests, title } = input;

  // Safety gate: only ever close the loop on a green build. A wrong merge is
  // worse than doing nothing (CLAUDE.md). Throwing here means no merge, no
  // receipt, no ping — nothing happened.
  if (tests.passed !== tests.total || tests.total < 1) {
    throw new Error(
      `Refusing to close the loop: tests are not green (${tests.passed}/${tests.total}).`
    );
  }

  // 1) Merge the tested fix.
  const merge = await mergePR({
    repo: { owner, name: repo },
    pr: { number: prNumber, title },
  });

  // 2) Post the receipt — the proof.
  const receiptUrl = await postReceipt({ owner, repo, prNumber, whyText, changeSummary, diff });

  // 3) Announce on Slack. Best-effort: a failed ping must NEVER undo a merge.
  let slack;
  try {
    slack = await notifySlack({
      summary: changeSummary,
      prUrl: prUrl || `${owner}/${repo}#${prNumber}`,
      testsPassed: tests.passed,
      testsTotal: tests.total,
    });
  } catch (err) {
    console.warn("slack ping failed (non-fatal):", err.message);
    slack = { sent: false, error: err.message };
  }

  return {
    merged: Boolean(merge?.merged),
    mergeSha: merge?.sha ?? null,
    receiptUrl,
    slack,
  };
}

function validate(input) {
  if (!input || typeof input !== "object") throw new Error("closeLoop: input required");
  for (const k of ["owner", "repo", "prNumber", "whyText", "changeSummary"]) {
    if (!input[k]) throw new Error(`closeLoop: missing required field "${k}"`);
  }
  const t = input.tests;
  if (!t || typeof t.passed !== "number" || typeof t.total !== "number") {
    throw new Error("closeLoop: tests { passed, total } (numbers) required");
  }
}
