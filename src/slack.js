// Slack side of the close-of-loop: the ping that announces a merged auto-fix.
//
// Transport is a Slack INCOMING WEBHOOK (not the Web API), verified against the
// official docs (see docs/sponsors.md):
//   POST application/json  { "text": "..." }  →  HTTP 200, body literally "ok"
// The webhook URL is a secret read from env SLACK_WEBHOOK_URL — never commit it.

import { config } from "./config.js";

const WEBHOOK_ENV = "SLACK_WEBHOOK_URL";

// Test seam: swap the fetch implementation so tests can assert the payload
// without hitting the network. Pass null to restore the real global fetch.
let _fetch = (...args) => fetch(...args);
export function _setFetch(fn) {
  _fetch = fn || ((...args) => fetch(...args));
}

// Low-level primitive every Slack message goes through. Reuses the shared
// dry-run guard so the team can work without a webhook; in live mode it fails
// LOUDLY if the webhook URL is missing rather than dropping the message.
// `blocks` is optional Block Kit; `text` is always sent as the fallback.
export async function sendSlack(text, blocks) {
  if (config.dryRun) {
    console.log("📣 [dry-run] slack.send → (would POST to SLACK_WEBHOOK_URL)");
    console.log(indent(text));
    return { dryRun: true };
  }

  const url = process.env[WEBHOOK_ENV];
  if (!url) {
    throw new Error(
      `${WEBHOOK_ENV} is not set — cannot send the Slack ping. Set it in your env ` +
        `(do not commit it), or run in dry-run (unset DRY_RUN).`
    );
  }

  const payload = blocks ? { text, blocks } : { text };
  const res = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // A Slack incoming webhook returns HTTP 200 with the body "ok" on success.
  const body = (await res.text()).trim();
  if (!res.ok || body !== "ok") {
    throw new Error(`Slack webhook rejected the message: HTTP ${res.status} "${body}"`);
  }
  return { ok: true, status: res.status };
}

// Public API — ping the channel when a fix has merged.
//   input:  { summary, prUrl }
//   output: { ok, status } on a live send, or { dryRun: true } in dry-run.
export async function notifySlack({ summary, prUrl } = {}) {
  if (!summary || !prUrl) {
    throw new Error("notifySlack requires { summary, prUrl }");
  }
  const text = `✅ Auto-fixed & merged: ${summary} ${prUrl}`;
  return sendSlack(text);
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "   │ " + l)
    .join("\n");
}
