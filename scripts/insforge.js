const { createClient } = require('@insforge/sdk');

function getClient() {
  if (!process.env.INSFORGE_URL || !process.env.INSFORGE_ANON_KEY) return null;
  return createClient({ baseUrl: process.env.INSFORGE_URL, anonKey: process.env.INSFORGE_ANON_KEY });
}

async function createJob({ pr, violation }) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client.database
      .from('jobs')
      .insert({
        pr_owner: pr.owner,
        pr_repo: pr.repo,
        pr_number: pr.number,
        violation_file: violation.file,
        violation_rule: violation.rule,
        status: 'processing',
      })
      .select('id')
      .single();
    if (error) { console.warn('Insforge createJob error:', error.message); return null; }
    return data.id;
  } catch (err) {
    console.warn('Insforge createJob failed:', err.message);
    return null;
  }
}

async function updateJob(jobId, fields) {
  const client = getClient();
  if (!client || !jobId) return;
  try {
    const { error } = await client.database.from('jobs').update(fields).eq('id', jobId);
    if (error) console.warn('Insforge updateJob error:', error.message);
  } catch (err) {
    console.warn('Insforge updateJob failed:', err.message);
  }
}

module.exports = { createJob, updateJob };
