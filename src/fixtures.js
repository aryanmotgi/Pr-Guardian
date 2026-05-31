// Fake inputs for the merge stage so this module runs end-to-end with no other
// team member's code and no credentials. THIS IS ALSO THE CONTRACT: whatever
// hands off to runMergeStage(input) must produce an object of this shape.
//
// Contract:
//   {
//     decision:   "fix" | "allow" | "escalate",   // the confidence-gate verdict
//     confidence: number 0..1,                     // how sure the brain was
//     repo:   { owner, name },                     // the demo repo
//     pr:     { number, branch, title, url },      // the PR being acted on
//     violation: {                                 // what a rule check flagged
//       rule, file, line, description
//     },
//     fix: {                                       // present for fix/allow/escalate
//       summary,   // one-line what-changed (fix) or n/a
//       diff,      // unified diff applied in the sandbox (fix only)
//       why        // the honest "why" — safe to merge / why allowed / why escalate
//     },
//     sandbox: { testsPassed, testOutput, attempts } // result of the sandbox run
//   }

// PR A — the real violation: full card number logged in app code. Agent fixed
// it, masked the PAN, tests pass. Merge stage should: merge → receipt → slack.
export const fixFixture = {
	decision: "fix",
	confidence: 0.96,
	repo: { owner: "acme", name: "acme-payments" },
	pr: {
		number: 42,
		branch: "feature/log-charge",
		title: "Add charge logging",
		url: "https://github.com/acme/acme-payments/pull/42",
	},
	violation: {
		rule: "Never log full payment card numbers (PANs) in application code",
		file: "src/payment.js",
		line: 18,
		description: "console.log writes the raw card number to application logs.",
	},
	fix: {
		summary:
			"Mask the card number before logging — only the last 4 digits remain.",
		diff: `--- a/src/payment.js
+++ b/src/payment.js
@@ -15,7 +15,7 @@ function charge(card, amount) {
-  console.log("Charging card " + card.number + " for " + amount);
+  console.log("Charging card ****" + card.number.slice(-4) + " for " + amount);`,
		why: "Logs now contain only the last 4 digits, which is PCI-DSS compliant and matches how the rest of the codebase masks PANs.",
	},
	sandbox: {
		testsPassed: true,
		testOutput: "Tests: 6 passed, 6 total",
		attempts: 2,
	},
};

// PR B — the decoy: a well-known fake test card used as test data in a test
// file. Agent correctly ALLOWS it. Merge stage should: receipt → slack, NO merge.
export const allowFixture = {
	decision: "allow",
	confidence: 0.91,
	repo: { owner: "acme", name: "acme-payments" },
	pr: {
		number: 43,
		branch: "feature/checkout-tests",
		title: "Add checkout tests",
		url: "https://github.com/acme/acme-payments/pull/43",
	},
	violation: {
		rule: "Never log full payment card numbers (PANs) in application code",
		file: "tests/checkout.test.js",
		line: 7,
		description: "Card-number-shaped literal found.",
	},
	fix: {
		summary: "No change.",
		why: "The number 4242 4242 4242 4242 is a well-known fake test card used as fixture data inside a *.test.js file — not a real leak. Fixing it would break the test.",
	},
	sandbox: {
		testsPassed: true,
		testOutput: "Tests: 6 passed, 6 total",
		attempts: 0,
	},
};

// An ambiguous case the confidence gate sends to a human. Merge stage should:
// receipt → slack, NO merge.
export const escalateFixture = {
	decision: "escalate",
	confidence: 0.48,
	repo: { owner: "acme", name: "acme-payments" },
	pr: {
		number: 44,
		branch: "feature/debug-dump",
		title: "Add debug dump endpoint",
		url: "https://github.com/acme/acme-payments/pull/44",
	},
	violation: {
		rule: "No hardcoded secrets/API keys committed in source",
		file: "src/server.js",
		line: 31,
		description:
			"A high-entropy string is assigned to a const — could be a key or could be a placeholder.",
	},
	fix: {
		summary: "No automatic change.",
		why: "Can't tell if this is a live secret or a dummy placeholder, and removing a real config value could break the service. Below the confidence bar to act — a human should decide.",
	},
	sandbox: { testsPassed: false, testOutput: "not run", attempts: 0 },
};

export const fixtures = {
	fix: fixFixture,
	allow: allowFixture,
	escalate: escalateFixture,
};
