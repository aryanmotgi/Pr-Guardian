// closeLoop — the CLOSE of the loop, on the team-agreed contract.
//
//   closeLoop({ pr, result })
//
//   pr     (from the decision/Shreyash): { owner, repo, number, title, violation? }
//          violation? : { file, line, reason, bad_code }   (optional context)
//   result (from the fix engine/Aryan):  { outcome?, escalate?, tests?, before?,
//                                          after?, time_ms?, reason? }
//
// It maps that contract onto runMergeStage — the tested three-outcome engine —
// so all existing behaviour (merge / receipt / Slack, the three outcomes, the
// green-build gate, severity) is reused, not re-implemented.
//
// Defensive by design: missing fields degrade gracefully and log clearly; the
// only hard error is a PR we can't even identify (no owner/repo/number).

import { runMergeStage } from "./index.js";
import { validateWithOpsera } from "./opsera.js";
import { config } from "./config.js";

const VALID = ["fix", "allow", "escalate"];

export async function closeLoop(input = {}) {
  const { pr, result } = toContract(input);
  return runFromContract(pr, result);
}

// Accepts the real { pr, result } contract OR the old flat signature
// (back-compat) and normalises both to { pr, result }.
function toContract(input) {
  if (input && (input.pr || input.result)) {
    return { pr: input.pr || {}, result: input.result || {} };
  }
  // Back-compat: the original flat shape closeLoop shipped with.
  const { owner, repo, prNumber, prUrl, whyText, changeSummary, diff, tests, title } = input || {};
  return {
    pr: { owner, repo, number: prNumber, title, url: prUrl },
    result: { outcome: "fix", tests, reason: whyText, changeSummary, diff },
  };
}

async function runFromContract(pr = {}, result = {}) {
  // The one thing we genuinely can't recover from: not knowing which PR.
  const owner = pr.owner;
  const repo = pr.repo;
  const number = pr.number;
  if (!owner || !repo || !number) {
    throw new Error("closeLoop: pr.owner, pr.repo and pr.number are required");
  }

  const violation = pr.violation || {};
  const url = pr.url || result.prUrl || `https://github.com/${owner}/${repo}/pull/${number}`;

  // 1) Resolve the outcome — explicit wins, else infer from `escalate`.
  let outcome = result.outcome || (result.escalate === true ? "escalate" : "fix");
  if (!VALID.includes(outcome)) {
    console.warn(`closeLoop: unknown outcome "${outcome}" — treating as escalate (fail safe).`);
    outcome = "escalate";
  }

  // 2) Safety gate. Only a "fix" with a fully green build may merge. Missing or
  //    non-green tests => do NOT merge; downgrade to escalate so a human looks.
  const tests = result.tests;
  const green =
    tests &&
    Number.isFinite(tests.passed) &&
    Number.isFinite(tests.total) &&
    tests.total > 0 &&
    tests.passed === tests.total;

  let gateReason = null;
  if (outcome === "fix" && !green) {
    gateReason = tests ? `tests are not green (${tests.passed}/${tests.total})` : "no test results were provided";
    console.warn(`closeLoop: not merging — ${gateReason}. Downgrading fix → escalate for human review.`);
    outcome = "escalate";
  }

  // 2b) Opsera DevSecOps compliance gate — runs RIGHT BEFORE merge, on a fix
  //     that already passed the test gate. A failing scan blocks the merge and
  //     escalates (no merge), so a human reviews the flagged finding. Opt-in:
  //     a no-op pass when OPSERA_GATE is off, so the core path is unchanged.
  let opseraReason = null;
  let opseraFindings = [];
  if (outcome === "fix") {
    const scan = await validateWithOpsera({ pr, result });
    opseraFindings = scan.findings;
    if (!scan.passed) {
      opseraReason = `Opsera compliance scan flagged ${scan.findings.length} issue(s)`;
      console.warn(`closeLoop: not merging — ${opseraReason}. Downgrading fix → escalate for human review.`);
      outcome = "escalate";
    }
  }
  const opseraDetail = opseraFindings.map((f) => f.message || f.rule).filter(Boolean).join("; ");

  // 3) Build the content from result + violation, with safe fallbacks.
  const reason = violation.reason || result.reason || result.whyText;
  // Smart human-facing fallback when the fix engine sends no text: prefer the
  // violation's reason, then name the offending file, else null (callers add a
  // generic last resort). Never a bare "(unspecified)" when we know the file.
  const violationDesc =
    reason || (violation.file ? `a potential issue in ${violation.file}` : null);

  const diff = buildDiff(result);
  const changeSummary =
    result.changeSummary || result.summary || violationDesc || "Applied an automated fix.";
  const timeMs = numberOrUndefined(result.time_ms ?? result.timeMs);

  let whyText;
  if (outcome === "escalate") {
    if (opseraReason) {
      whyText = `Opsera compliance gate blocked the merge — ${opseraDetail || opseraReason}. A human should review before merging.`;
    } else if (gateReason) {
      whyText = `A fix was produced but ${gateReason}, so it can't be safely merged — a human should verify.`;
    } else {
      whyText = result.why || violationDesc || "Couldn't auto-fix this safely — needs human review.";
    }
  } else if (outcome === "allow") {
    whyText = result.why || violationDesc || "Reviewed — compliant, no action needed.";
  } else {
    whyText = result.why || violationDesc || "Auto-fixed to comply with the rule.";
  }

  // 4) Map onto runMergeStage's input contract and delegate.
  const mergeInput = {
    decision: outcome,
    repo: { owner, name: repo },
    pr: { number, url, title: pr.title },
    violation: {
      rule: opseraReason ? "Opsera compliance gate" : violation.rule || violationDesc || "(unspecified)",
      file: violation.file,
      line: violation.line,
      description: opseraReason ? opseraDetail || opseraReason : violation.reason || reason,
      badCode: violation.bad_code,
    },
    fix: { summary: changeSummary, diff, why: whyText, timeMs },
    // Only the "fix" path is gated on this; for it we've proven green above.
    sandbox: { testsPassed: outcome === "fix" ? true : Boolean(green), passed: tests?.passed, total: tests?.total },
  };

  const out = await runMergeStage(mergeInput);

  return {
    outcome: out.decision,
    merged: out.merged,
    mergeSha: out.merge?.sha ?? null,
    receiptUrl: out.receipt?.url ?? null,
    slack: out.slack,
    ...(gateReason ? { downgradedFrom: "fix", downgradeReason: gateReason } : {}),
    ...(opseraReason
      ? { downgradedFrom: "fix", downgradeReason: opseraReason, opsera: { passed: false, findings: opseraFindings } }
      : opseraFindings.length || config.opsera.enabled
        ? { opsera: { passed: true, findings: opseraFindings } }
        : {}),
  };
}

// Prefer an explicit unified diff; otherwise synthesise one from before/after.
function buildDiff(result) {
  if (result.diff && String(result.diff).trim()) return result.diff;
  const { before, after } = result;
  if (before == null && after == null) return undefined;
  const minus = String(before ?? "").split("\n").map((l) => "- " + l);
  const plus = String(after ?? "").split("\n").map((l) => "+ " + l);
  return [...minus, ...plus].join("\n");
}

function numberOrUndefined(v) {
  return Number.isFinite(v) ? v : undefined;
}
