// Runs closeLoop against realistic { pr, result } fakes — the team-agreed
// contract — for all three outcomes, with no other team member's code and no
// credentials.
//
//   npm run close        → DRY RUN: shows every step for fix / allow / escalate.
//   DRY_RUN=false ...     → live (needs GITHUB_TOKEN + SLACK_WEBHOOK_URL).

import { closeLoop } from "./close-loop.js";
import { config } from "./config.js";

// Shreyash's `pr` (the decision) + Aryan's `result` (the fix outcome).
const scenarios = {
	fix: {
		pr: {
			owner: "ssmoney1",
			repo: "acme-payments",
			number: 1,
			title: "Add charge logging",
			violation: {
				file: "src/payment.js",
				line: 18,
				rule: "PCI-DSS: never log a raw payment card number (PAN)",
				reason: "Writes the full card number to the logs on every charge",
				bad_code: 'console.log("Charging card " + card.number)',
			},
		},
		result: {
			// outcome omitted on purpose — inferred from escalate:false → "fix"
			escalate: false,
			time_ms: 8200,
			tests: { passed: 6, total: 6 },
			summary: "Masked the card number — only the last 4 digits are logged now",
			before: 'console.log("Charging card " + card.number + " for " + amount);',
			after:
				'console.log("Charging card ****" + card.number.slice(-4) + " for " + amount);',
		},
	},

	allow: {
		pr: {
			owner: "ssmoney1",
			repo: "acme-payments",
			number: 2,
			title: "Add checkout tests",
			violation: {
				file: "tests/checkout.test.js",
				line: 7,
				rule: "No full payment card numbers (PANs) in source",
				reason: "Contains the digits 4242 4242 4242 4242",
			},
		},
		result: {
			outcome: "allow",
			time_ms: 1500,
			tests: { passed: 6, total: 6 },
			why: "4242 4242 4242 4242 is a well-known fake test card used as fixture data inside a *.test.js file — not a real card and not a real leak. Fixing it would break the test.",
		},
	},

	escalate: {
		pr: {
			owner: "ssmoney1",
			repo: "acme-payments",
			number: 3,
			title: "Add debug dump endpoint",
			violation: {
				file: "src/server.js",
				line: 31,
				rule: "No hardcoded secrets / API keys committed in source",
				reason: "A high-entropy string is assigned to `const KEY`",
				bad_code: 'const KEY = "sk-live-..."',
			},
		},
		// gave up after 3 attempts → escalate:true; no tests → must not merge anyway
		result: {
			escalate: true,
			time_ms: 12000,
			why: "Can't tell if this is a live secret or a placeholder — removing a real config value could break the service, so it's below the bar to act automatically. A human should decide.",
		},
	},
};

console.log(
	`\n=== PR Guardian · closeLoop({ pr, result }) · ${config.dryRun ? "DRY RUN" : "LIVE"} ===`,
);

for (const name of ["fix", "allow", "escalate"]) {
	console.log(
		`\n──────────────────────────── scenario: ${name} ────────────────────────────`,
	);
	try {
		const out = await closeLoop(scenarios[name]);
		console.log(
			"\n  result:",
			JSON.stringify(out, (k, v) => (k === "slack" ? undefined : v)),
		);
		console.log(
			`  → ${out.merged ? "✅ merged" : "⏸️  not merged"} · outcome=${out.outcome}\n`,
		);
	} catch (err) {
		console.error("  ❌ closeLoop crashed:", err.message, "\n");
	}
}
