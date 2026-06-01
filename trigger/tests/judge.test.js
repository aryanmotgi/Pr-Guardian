require("dotenv").config();
const { test } = require("node:test");
const assert = require("node:assert");
const { judge } = require("../src/judge");

// PR A — real violation: payment.js logging full card number in app code
const FAKE_DIFF_VIOLATION = {
	prNumber: 1,
	title: "Add payment logging",
	files: [
		{
			filename: "src/payment.js",
			patch: `@@ -20,6 +20,7 @@ function processPayment({ cardNumber, amount, currency = 'USD' }) {
+  logger.info('Processing card', { cardNumber, amount });
   const pan = String(cardNumber).replace(/\\s/g, '');
   logger.info('Processing payment', { last4: pan.slice(-4), amount, currency });`,
		},
	],
};

// PR B — decoy: test file using standard Stripe test card as fixture data
const FAKE_DIFF_DECOY = {
	prNumber: 2,
	title: "Add checkout tests",
	files: [
		{
			filename: "tests/checkout.test.js",
			patch: `@@ -0,0 +1,10 @@
+const STRIPE_TEST_CARDS = {
+  visa: '4242424242424242',
+  mastercard: '5555555555554444',
+};
+
+test('processes valid payment', () => {
+  const result = checkout(cart, { cardNumber: STRIPE_TEST_CARDS.visa });
+  expect(result.success).toBe(true);
+});`,
		},
	],
};

test("PR A — catches real violation in app code", async () => {
	const decision = await judge(FAKE_DIFF_VIOLATION);
	console.log("PR A decision:", decision);
	assert.strictEqual(decision.verdict, "violation");
	assert.strictEqual(decision.confidence, "high");
});

test("PR B — allows test card decoy in test file", async () => {
	const decision = await judge(FAKE_DIFF_DECOY);
	console.log("PR B decision:", decision);
	assert.strictEqual(decision.verdict, "false-alarm");
});
