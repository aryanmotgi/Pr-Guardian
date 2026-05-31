// Runs the whole close-of-loop against a FAKE confirmed fix — merge → receipt →
// Slack — with no other team member's code and no credentials.
//
//   npm run close        → DRY RUN: shows every step, sends nothing.
//   DRY_RUN=false ...     → live (needs GITHUB_TOKEN + SLACK_WEBHOOK_URL).

import { closeLoop } from "./close-loop.js";
import { config } from "./config.js";

// Fake input modelled on planted PR A (the real card-logging violation, fixed).
const fake = {
  owner: "acme",
  repo: "acme-payments",
  prNumber: 42,
  prUrl: "https://github.com/acme/acme-payments/pull/42",
  title: "Add charge logging",
  whyText:
    "This PR logged the full payment card number in src/payment.js, violating our rule against writing PANs to application logs (PCI-DSS).",
  changeSummary:
    "Masked the card number before logging so only the last 4 digits remain (****1234).",
  diff: `--- a/src/payment.js
+++ b/src/payment.js
@@ -15,7 +15,7 @@ function charge(card, amount) {
-  console.log("Charging card " + card.number + " for " + amount);
+  console.log("Charging card ****" + card.number.slice(-4) + " for " + amount);`,
  tests: { passed: 6, total: 6 },
};

console.log(`\n=== PR Guardian · closeLoop · ${config.dryRun ? "DRY RUN" : "LIVE"} ===\n`);

try {
  const out = await closeLoop(fake);
  console.log("\n--- result ---");
  console.log(JSON.stringify(out, null, 2));
  console.log(`\n${out.merged ? "✅ loop closed" : "⏸️  not merged"} · receipt posted · slack pinged\n`);
} catch (err) {
  console.error("\n❌ closeLoop failed:", err.message, "\n");
  process.exit(1);
}
