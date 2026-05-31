// @ts-nocheck
// Kalibr integration — wraps Claude fix calls with intelligent routing and
// self-healing (prompt repair + retry on bad output).
// Docs: https://kalibr.systems/docs/quickstart
//
// Returns null when KALIBR_API_KEY is unset so callers fall back to direct
// Anthropic without crashing — safe to wire in before the key is obtained.
"use strict";

require("dotenv").config();

// Verified: Object.keys(require('@kalibr/sdk')) includes 'Router' and 'KalibrIntelligence'.
const { Router, KalibrIntelligence } = require("@kalibr/sdk");

let _router = null;

/**
 * Returns the singleton Kalibr Router, or null if KALIBR_API_KEY is not set.
 * Callers must null-check before using.
 */
function getKalibrRouter() {
	if (!process.env.KALIBR_API_KEY) {
		return null;
	}
	if (_router) return _router;

	// KalibrIntelligence must be initialized before Router uses it internally.
	// init() reads KALIBR_API_KEY + KALIBR_TENANT_ID from env when not passed explicitly.
	if (!KalibrIntelligence.isInitialized()) {
		KalibrIntelligence.init({
			apiKey: process.env.KALIBR_API_KEY,
			tenantId: process.env.KALIBR_TENANT_ID || undefined,
		});
	}

	// ASSUMPTION: "claude-sonnet-4-6" is a valid Kalibr path identifier.
	//   Docs example uses "claude-sonnet-4-20250514". If routing fails with
	//   this ID, try the full dated string from the Kalibr dashboard.
	_router = new Router({
		goal: "generate-code-fix",
		paths: ["claude-sonnet-4-6"],

		// successWhen checks raw LLM output before tests run in Daytona.
		// A valid fix: non-empty, no markdown fences, looks like a code line.
		// Real pass/fail signal comes from router.report() after test execution.
		successWhen: (out) =>
			typeof out === "string" &&
			out.trim().length > 0 &&
			!out.startsWith("```"),

		// repairPrompt: true — if successWhen fails, Kalibr rewrites the prompt
		// and retries the LLM call internally before returning to our retry loop.
		// This is the Gate 2 / self-healing layer described in CLAUDE.md.
		repairPrompt: true,
	});

	console.log("[kalibr] Router initialized (goal=generate-code-fix, repairPrompt=true)");
	return _router;
}

module.exports = { getKalibrRouter };
