// Runs postReceipt against a FAKE input so you can see the comment it would post
// with no other team member's code and no credentials.
//
//   npm run receipt
//
// In DRY RUN (the default) it prints the exact markdown and returns null. With a
// real GITHUB_TOKEN + DRY_RUN=false it posts on the real PR and returns the URL.

import { config } from "./config.js";
import { postReceipt } from "./receipt.js";

// Fake input modelled on planted PR A (the real card-logging violation).
const fake = {
	owner: "acme",
	repo: "acme-payments",
	prNumber: 42,
	whyText:
		"This PR logged the full payment card number in src/payment.js, violating our rule against writing PANs to application logs (PCI-DSS).",
	changeSummary:
		"Masked the card number before logging so only the last 4 digits remain (****1234), matching how the rest of the codebase handles card data.",
	diff: `--- a/src/payment.js
+++ b/src/payment.js
@@ -15,7 +15,7 @@ function charge(card, amount) {
-  console.log("Charging card " + card.number + " for " + amount);
+  console.log("Charging card ****" + card.number.slice(-4) + " for " + amount);`,
};

console.log(
	`\n=== PR Guardian · postReceipt · ${config.dryRun ? "DRY RUN" : "LIVE"} ===\n`,
);

const url = await postReceipt(fake);
console.log(
	"\nreturned comment URL:",
	url ?? "(dry-run — no real comment posted)\n",
);
