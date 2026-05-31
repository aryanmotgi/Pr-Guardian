// Insforge stub — returns hardcoded rules when credentials are not configured.
async function getRules() {
  return [
    'Never log or print full payment card numbers (PANs) in application code.',
    'Never log other sensitive PII (full SSNs, passwords, full card data) in app code.',
    'No hardcoded secrets or API keys committed in source.',
  ];
}

module.exports = { getRules };
