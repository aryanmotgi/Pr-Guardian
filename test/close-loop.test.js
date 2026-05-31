// Mocked test for closeLoop — proves it runs merge → receipt → Slack in that
// order, returns a combined result, and refuses to merge on a non-green build.
// Drives a real Octokit (injected fetch) + the Slack _setFetch seam. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";

process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";
process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/fake";

const { closeLoop } = await import("../src/close-loop.js");
const { _setOctokit } = await import("../src/github.js");
const { _setFetch } = await import("../src/slack.js");

function install() {
  const gh = [];
  const slack = [];

  _setOctokit(
    new Octokit({
      auth: "test-token",
      request: {
        fetch: async (url, opts = {}) => {
          gh.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
          let data = {};
          let status = 200;
          if (/\/pulls\/\d+\/merge$/.test(url)) {
            data = { merged: true, sha: "abc123" };
          } else if (/\/issues\/\d+\/comments$/.test(url)) {
            data = { html_url: "https://github.com/acme/acme-payments/pull/42#issuecomment-9" };
            status = 201;
          }
          return new Response(JSON.stringify(data), {
            status,
            headers: { "content-type": "application/json" },
          });
        },
      },
    })
  );

  _setFetch(async (url, opts = {}) => {
    slack.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    return new Response("ok", { status: 200 });
  });

  return { gh, slack };
}

const base = {
  owner: "acme",
  repo: "acme-payments",
  prNumber: 42,
  prUrl: "https://github.com/acme/acme-payments/pull/42",
  whyText: "Logged the full card number in src/payment.js.",
  changeSummary: "Masked the PAN to ****1234 before logging.",
  tests: { passed: 6, total: 6 },
};

test("closeLoop runs merge → receipt → slack in order and returns a combined result", async () => {
  const { gh, slack } = install();
  const out = await closeLoop(base);

  console.log("\n[closeLoop] result:", JSON.stringify(out, null, 2));
  console.log("[closeLoop] github calls:", gh.map((c) => `${c.method} ${c.url}`));

  // GitHub calls happen in order: merge first, then the receipt comment.
  assert.match(gh[0].url, /\/pulls\/42\/merge$/, "merge is step 1");
  assert.match(gh[1].url, /\/issues\/42\/comments$/, "receipt is step 2");

  // Slack ping is step 3 — the merged one-liner.
  assert.equal(slack.length, 1);
  assert.match(slack[0].body.text, /Auto-fixed & merged/);

  assert.deepEqual(out, {
    merged: true,
    mergeSha: "abc123",
    receiptUrl: "https://github.com/acme/acme-payments/pull/42#issuecomment-9",
    slack: { ok: true, status: 200 },
  });
});

test("closeLoop refuses to merge when tests are not green (nothing happens)", async () => {
  const { gh, slack } = install();
  await assert.rejects(() => closeLoop({ ...base, tests: { passed: 5, total: 6 } }), /not green/);
  assert.equal(gh.length, 0, "no GitHub calls when gated");
  assert.equal(slack.length, 0, "no Slack calls when gated");
});

test("closeLoop validates required fields", async () => {
  install();
  await assert.rejects(() => closeLoop({ owner: "acme", repo: "x", prNumber: 1 }), /missing required field/);
});
