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
    if (blocks) console.log(indent("blocks: " + JSON.stringify(blocks)));
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
//   input:  { summary, prUrl, testsPassed?, testsTotal? }
//   output: { ok, status } on a live send, or { dryRun: true } in dry-run.
//
// Sends a Block Kit card (header + optional test-count + a "View PR" button) and
// keeps the plain one-liner as `text` — Slack's required fallback when blocks
// can't render. testsPassed/testsTotal are optional; when present they add a
// credibility line ("🧪 6/6 tests passed").
export async function notifySlack({ summary, prUrl, testsPassed, testsTotal } = {}) {
  if (!summary || !prUrl) {
    throw new Error("notifySlack requires { summary, prUrl }");
  }
  const text = `✅ Auto-fixed & merged: ${summary} ${prUrl}`;
  return sendSlack(text, buildMergedBlocks({ summary, prUrl, testsPassed, testsTotal }));
}

function buildMergedBlocks({ summary, prUrl, testsPassed, testsTotal }) {
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: `✅ *Auto-fixed & merged*\n${summary}` } },
  ];

  if (typeof testsTotal === "number") {
    const passed = typeof testsPassed === "number" ? testsPassed : testsTotal;
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `🧪 ${passed}/${testsTotal} tests passed · verified in an isolated sandbox` },
      ],
    });
  }

  // A url button opens the PR in the browser. Per Slack docs, url buttons still
  // emit an interaction payload, but with an incoming webhook (no interactivity
  // endpoint) the link opens fine — we simply don't ack it.
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View PR" },
        url: prUrl,
        action_id: "view_pr",
        style: "primary",
      },
    ],
  });

  return blocks;
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "   │ " + l)
    .join("\n");
}
