// Insforge stub — no-ops when credentials are not configured.
// Replace with real integration when Insforge credentials are available.

async function createJob(/* { pr, violation } */) {
  return null;
}

async function updateJob(/* jobId, fields */) {}

module.exports = { createJob, updateJob };
