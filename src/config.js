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

  slack: {
    get token() {
      return process.env.SLACK_BOT_TOKEN || null;
    },
    get channel() {
      return process.env.SLACK_CHANNEL || null;
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
