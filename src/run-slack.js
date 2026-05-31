// Runs notifySlack against a FAKE input.
//
//   npm run slack        → DRY RUN: prints the message, sends nothing, no secret needed.
//   npm run slack:live   → loads .env (SLACK_WEBHOOK_URL + DRY_RUN=false) and
//                          actually posts to the channel, so you can confirm it lands.
//
// The webhook URL is a secret: keep it in .env (gitignored), never in code or chat.

import { config } from "./config.js";
import { notifySlack } from "./slack.js";

// Fake input modelled on planted PR A (the real card-logging violation).
const fake = {
	summary: "Masked the card number before logging in src/payment.js (PCI rule)",
	prUrl: "https://github.com/acme/acme-payments/pull/42",
	testsPassed: 6,
	testsTotal: 6,
};

console.log(
	`\n=== PR Guardian · notifySlack · ${config.dryRun ? "DRY RUN" : "LIVE"} ===\n`,
);

try {
	const res = await notifySlack(fake);
	if (res.dryRun) {
		console.log(
			"\n(dry-run — set SLACK_WEBHOOK_URL and DRY_RUN=false to send for real)\n",
		);
	} else {
		console.log(
			`\n✅ sent to Slack (HTTP ${res.status}) — check the channel\n`,
		);
	}
} catch (err) {
	console.error("\n❌ Slack send failed:", err.message, "\n");
	process.exit(1);
}
