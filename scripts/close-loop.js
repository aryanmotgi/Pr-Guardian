// ASSUMPTION: Kaushik will replace this stub with the real merge + receipt + Slack flow.
// ASSUMPTION: closeLoop signature is closeLoop({ pr, result }) where:
//   - pr     = { owner, repo, number, title }  (from Shreyash's payload)
//   - result = whatever runFixEngine returned (success | escalate object)
// Stub returns { ok: true, stub: true } so /fix can keep working until the real one lands.

async function closeLoop({ pr, result }) {
  console.log('[close-loop] STUB called for PR', pr && `${pr.owner}/${pr.repo}#${pr.number}`);
  console.log('[close-loop] result summary:', {
    success: !!result.success,
    escalate: !!result.escalate,
    attempts: result.attempts,
    time_ms: result.time_ms,
    tigris_key: result.tigris_key,
  });
  return { ok: true, stub: true };
}

module.exports = { closeLoop };
