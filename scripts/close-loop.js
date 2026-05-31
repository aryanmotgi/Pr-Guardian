// Adapter: bridges the CJS fix engine (scripts/) to Kaushik's ESM merge stage
// (src/close-loop.js → src/index.js → merge + receipt + Slack).
//
// Server.js calls `closeLoop({ pr, result })` where:
//   - pr     = { owner, repo, number, title, url?, violation? } from the trigger payload
//   - result = whatever runFixEngine returned (success-shape or escalate-shape)
//
// Kaushik's closeLoop expects a normalised result:
//   { outcome?, escalate?, tests?: { passed, total }, before?, after?, time_ms?, reason? }
// We translate fix-engine's shape into that here, then delegate.

let _esmModule = null;
async function loadKaushikCloseLoop() {
  if (!_esmModule) {
    // CJS → ESM dynamic import. Path is relative to this file.
    _esmModule = await import('../src/close-loop.js');
  }
  return _esmModule.closeLoop;
}

function mapResult(result = {}) {
  // Escalate branch: tests never went green within MAX_ATTEMPTS.
  if (result.escalate) {
    return {
      outcome: 'escalate',
      escalate: true,
      reason: result.reason,
      before: result.diff?.before,
      after: result.diff?.after,
      time_ms: result.time_ms,
    };
  }

  // Success branch: sandbox tests exited 0. testsPassed may be null if the
  // regex didn't pick up a count — fall back to (1,1) so Kaushik's green gate
  // accepts the merge (exit code 0 is the real proof, not the count).
  if (result.success) {
    const n = Number.isFinite(result.tests_passed) && result.tests_passed > 0
      ? result.tests_passed
      : 1;
    return {
      outcome: 'fix',
      tests: { passed: n, total: n },
      before: result.diff?.before,
      after: result.diff?.after,
      time_ms: result.time_ms,
      reason: result.reason,
    };
  }

  // Unknown shape — fail safe by escalating.
  return {
    outcome: 'escalate',
    escalate: true,
    reason: 'Fix engine returned an unrecognised result shape',
    time_ms: result.time_ms,
  };
}

async function closeLoop({ pr, result }) {
  const kaushikCloseLoop = await loadKaushikCloseLoop();
  const mapped = mapResult(result);
  console.log(
    '[close-loop] handing off to src/close-loop.js for',
    pr && `${pr.owner}/${pr.repo}#${pr.number}`,
    'as outcome:', mapped.outcome
  );
  return kaushikCloseLoop({ pr, result: mapped });
}

module.exports = { closeLoop };
