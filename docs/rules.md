# Rules + the two planted PRs

## The hardcoded rules the agent checks every PR against
1. Never log or print full payment card numbers (PANs) in application code.
2. Never log other sensitive PII (full SSNs, passwords, full card data) in app code.
3. No hardcoded secrets/API keys committed in source.
4. (Add 1-2 more simple, obvious-to-check rules here if useful.)

## The two planted PRs (this is the demo's whole argument)

### PR A — the REAL violation (agent MUST catch + fix)
- Where: application code (a real handler, e.g. a payment/checkout path).
- What: a logging line that writes the FULL card number to logs.
- Expected: HIGH confidence violation -> sandbox -> rewrite to mask (e.g. ****1234) -> tests pass -> merge -> receipt -> Slack.

### PR B — the DECOY (agent MUST allow)
- Where: a TEST file (e.g. checkout.test.js).
- What: a well-known fake test card (4242 4242 4242 4242) used as test data.
- Expected: recognizes test data in a test file, NOT a real leak -> ALLOW, log why. "Fixing" this = FAILING the demo.

## Why both matter
Anyone can show a catch. Showing the agent ALLOW the decoy proves it understands context, not keywords. Keep the difference clean: real = production logging in app code; decoy = the 4242 number in a *.test file.
