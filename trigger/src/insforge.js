const { createClient } = require('@insforge/sdk');

const HARDCODED_RULES = [
  'Never log or print full payment card numbers (PANs) in application code.',
  'Never log other sensitive PII (full SSNs, passwords, full card data) in app code.',
  'No hardcoded secrets or API keys committed in source.',
];

function getClient() {
  if (!process.env.INSFORGE_URL || !process.env.INSFORGE_ANON_KEY) return null;
  return createClient({ baseUrl: process.env.INSFORGE_URL, anonKey: process.env.INSFORGE_ANON_KEY });
}

async function getRules() {
  const client = getClient();
  if (!client) return HARDCODED_RULES;
  try {
    const { data, error } = await client.database.from('rules').select('description');
    if (error || !data || data.length === 0) return HARDCODED_RULES;
    return data.map(r => r.description);
  } catch {
    return HARDCODED_RULES;
  }
}

async function logJudgment(judgment) {
  const client = getClient();
  if (!client) return;
  try {
    await client.database.from('judgments').insert({
      verdict: judgment.verdict,
      confidence: judgment.confidence,
      reason: judgment.reason,
      file: judgment.file,
      line: judgment.line,
      model: 'Qwen/Qwen3.5-122B-A10B',
    });
  } catch {
    // fire-and-forget — don't break the judgment flow if table doesn't exist
  }
}

module.exports = { getRules, logJudgment };
