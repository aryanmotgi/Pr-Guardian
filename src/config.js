// Central config for the merge stage. Reads env, but never throws on missing
// creds — the stage runs in DRY_RUN by default so the whole team can build
// against fake inputs without secrets (per CLAUDE.md hackathon mode).

// Fields are getters so env is read at access time, not at import. ESM hoists
// imports, so this lets tests (and a live runner) set DRY_RUN / GITHUB_TOKEN
// before the values are used. App behavior is unchanged.
export const config = {
	// When true (the default), no real GitHub/Slack calls are made — the stage
	// logs exactly what it WOULD do. Set DRY_RUN=false (with creds) to go live.
	get dryRun() {
		return process.env.DRY_RUN !== "false";
	},

	github: {
		get token() {
			return process.env.GITHUB_TOKEN || null;
		},
		// ASSUMPTION: "squash" merge for a clean history on the demo repo.
		// Octokit accepts "merge" | "squash" | "rebase". Verify with the team.
		get mergeMethod() {
			return process.env.GITHUB_MERGE_METHOD || "squash";
		},
	},

	// Opsera DevSecOps compliance gate — runs RIGHT BEFORE merge when enabled.
	// Opt-in: OFF by default so the core close-loop (and its tests) are unchanged.
	opsera: {
		// The gate only runs when explicitly turned on.
		get enabled() {
			return process.env.OPSERA_GATE === "true";
		},
		// Bearer token for the Opsera MCP server. VERIFIED from docs: auth is
		// `Authorization: Bearer <token>`, token from Profile → Access Tokens
		// (scope "API Access"). Read at access time; never committed.
		get apiKey() {
			return process.env.OPSERA_API_KEY || null;
		},
		// ASSUMPTION: the MCP server URL. The agents page shows
		// https://mcp.opsera.io/mcp, but the docs' config example uses
		// https://agent.opsera.ai/mcp and notes tenant-specific URLs exist
		// ("contact Opsera for your unique API URL"). Override via OPSERA_MCP_URL.
		get url() {
			return process.env.OPSERA_MCP_URL || "https://mcp.opsera.io/mcp";
		},
		// Demo-only knob: with no creds (dry-run) the gate runs a SIMULATED scan.
		// Set OPSERA_SIM_FAIL=true to simulate a failing scan (the escalate branch).
		get simulateFail() {
			return process.env.OPSERA_SIM_FAIL === "true";
		},
	},

	slack: {
		get token() {
			return process.env.SLACK_BOT_TOKEN || null;
		},
		get channel() {
			return process.env.SLACK_CHANNEL || null;
		},
		// Who to @-mention when a violation is escalated to a human. A real Slack
		// mention is "<@USERID>" or a group "<!subteam^ID>"; "<!here>" pings active
		// channel members. Override via SLACK_ESCALATION_MENTION.
		get escalationMention() {
			return process.env.SLACK_ESCALATION_MENTION || "<!here>";
		},
	},
};

// True only if we have what we need to make real GitHub calls.
export function canCallGithub() {
	return Boolean(config.github.token);
}

// True only if we have what we need to make real Slack calls.
export function canCallSlack() {
	return Boolean(config.slack.token && config.slack.channel);
}
