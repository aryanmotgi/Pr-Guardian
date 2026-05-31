// Runs the merge stage against a fixture so you can see the whole chain without
// any other team member's code or any credentials.
//
//   npm run demo            → the real violation (fix → merge → receipt → slack)
//   npm run demo:allow      → the decoy        (allow → receipt → slack, no merge)
//   npm run demo:escalate   → ambiguous case   (escalate → receipt → slack, no merge)

import { config } from "./config.js";
import { fixtures } from "./fixtures.js";
import { runMergeStage } from "./index.js";

const which = process.argv[2] || "fix";
const input = fixtures[which];

if (!input) {
	console.error(
		`Unknown scenario "${which}". Use one of: ${Object.keys(fixtures).join(", ")}`,
	);
	process.exit(1);
}

console.log(`\n=== PR Guardian · merge stage · scenario: ${which} ===`);
console.log(`Mode: ${config.dryRun ? "DRY RUN (no real calls)" : "LIVE"}\n`);

try {
	const outcome = await runMergeStage(input);
	console.log("\n--- outcome ---");
	console.log(JSON.stringify(outcome, null, 2));
	console.log(
		`\n${outcome.merged ? "✅ merged" : "⏸️  not merged"} · receipt posted · slack pinged\n`,
	);
} catch (err) {
	console.error("\n❌ merge stage failed:", err.message, "\n");
	process.exit(1);
}
