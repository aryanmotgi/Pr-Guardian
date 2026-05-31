// Mocked test for the Slack ping — proves notifySlack/sendSlack POST the right
// payload to the webhook and parse the "ok" response, with no network. Uses the
// _setFetch seam so we never touch a real webhook.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DRY_RUN = "false";
process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/fake-webhook";

const { notifySlack, sendSlack, _setFetch } = await import("../src/slack.js");

function installRecorder(responseBody = "ok", status = 200) {
  const calls = [];
  _setFetch(async (url, opts = {}) => {
    calls.push({
      url,
      method: opts.method,
      headers: opts.headers,
      body: opts.body ? JSON.parse(opts.body) : null,
    });
    return new Response(responseBody, { status });
  });
  return calls;
}

test("notifySlack posts the one-line merged message to the webhook", async () => {
  const calls = installRecorder();
  const res = await notifySlack({
    summary: "Masked the PAN before logging",
    prUrl: "https://github.com/acme/acme-payments/pull/42",
  });

  console.log("\n[slack] payload:", JSON.stringify(calls[0].body));

  assert.equal(calls.length, 1, "should POST exactly once");
  const c = calls[0];
  assert.equal(c.method, "POST");
  assert.match(c.url, /hooks\.slack\.com/);
  assert.equal(c.headers["Content-Type"], "application/json");
  assert.equal(
    c.body.text,
    "✅ Auto-fixed & merged: Masked the PAN before logging https://github.com/acme/acme-payments/pull/42"
  );
  assert.deepEqual(res, { ok: true, status: 200 });
});

test("notifySlack throws on missing inputs", async () => {
  installRecorder();
  await assert.rejects(() => notifySlack({ summary: "no url" }), /requires \{ summary, prUrl \}/);
});

test("sendSlack fails loudly when SLACK_WEBHOOK_URL is missing", async () => {
  installRecorder();
  const saved = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  try {
    await assert.rejects(() => sendSlack("hi"), /SLACK_WEBHOOK_URL is not set/);
  } finally {
    process.env.SLACK_WEBHOOK_URL = saved;
  }
});

test("sendSlack fails loudly when the webhook rejects the message", async () => {
  installRecorder("invalid_payload", 400);
  await assert.rejects(() => sendSlack("hi"), /Slack webhook rejected/);
});
