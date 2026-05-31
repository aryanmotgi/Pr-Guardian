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
        reason: "Logs the full payment card number (PAN) — violates our no-PAN-in-logs rule",
        bad_code: 'console.log("Charging card " + card.number)',
      },
    },
    result: {
      // outcome omitted on purpose — inferred from escalate:false → "fix"
      escalate: false,
      time_ms: 8200,
      tests: { passed: 6, total: 6 },
      before: 'console.log("Charging card " + card.number + " for " + amount);',
      after: 'console.log("Charging card ****" + card.number.slice(-4) + " for " + amount);',
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
        reason: "4242 4242 4242 4242 is a well-known fake test card used as fixture data — not a real leak",
      },
    },
    result: { outcome: "allow", time_ms: 1500, tests: { passed: 6, total: 6 } },
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
        reason: "Possible hardcoded secret / API key committed in source",
        bad_code: 'const KEY = "sk-live-..."',
      },
    },
    // gave up after 3 attempts → escalate:true; no tests → must not merge anyway
    result: { escalate: true, time_ms: 12000 },
  },
};

console.log(`\n=== PR Guardian · closeLoop({ pr, result }) · ${config.dryRun ? "DRY RUN" : "LIVE"} ===`);

for (const name of ["fix", "allow", "escalate"]) {
  console.log(`\n──────────────────────────── scenario: ${name} ────────────────────────────`);
  try {
    const out = await closeLoop(scenarios[name]);
    console.log("\n  result:", JSON.stringify(out, (k, v) => (k === "slack" ? undefined : v)));
    console.log(`  → ${out.merged ? "✅ merged" : "⏸️  not merged"} · outcome=${out.outcome}\n`);
  } catch (err) {
    console.error("  ❌ closeLoop crashed:", err.message, "\n");
  }
}
