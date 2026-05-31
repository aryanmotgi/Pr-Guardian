// Mocked test for postReceipt — proves it posts exactly one comment to the
// correct GitHub endpoint, with a body that reads clearly, and returns the URL.
// Same technique as merge.test.js: a real Octokit client with an injected fake
// fetch that records the request. No network, no creds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";

process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";

const { postReceipt, formatReceiptComment } = await import("../src/receipt.js");
const { _setOctokit } = await import("../src/github.js");

function installRecorder() {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ method: opts.method, url, body: opts.body ? JSON.parse(opts.body) : null });
    return new Response(
      JSON.stringify({
        id: 7,
        html_url: "https://github.com/acme/acme-payments/pull/42#issuecomment-7",
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  };
  _setOctokit(new Octokit({ auth: "test-token", request: { fetch } }));
  return calls;
}

test("postReceipt posts one comment to the right endpoint and returns the URL", async () => {
  const calls = installRecorder();

  const url = await postReceipt({
    owner: "acme",
    repo: "acme-payments",
    prNumber: 42,
    whyText: "Logged the full card number in src/payment.js (PCI rule).",
    changeSummary: "Masked the PAN to ****1234 before logging.",
  });

  console.log("\n[receipt] returned URL:", url);
  console.log("[receipt] github calls:", calls.map((c) => `${c.method} ${c.url}`));

  assert.equal(calls.length, 1, "should post exactly one comment");
  const c = calls[0];
  assert.equal(c.method, "POST");
  assert.match(c.url, /\/repos\/acme\/acme-payments\/issues\/42\/comments$/);
  assert.match(c.body.body, /card number/);
  assert.match(c.body.body, /Masked the PAN/);
  assert.match(c.body.body, /Tests pass/);
  assert.equal(url, "https://github.com/acme/acme-payments/pull/42#issuecomment-7");
});

test("formatReceiptComment is skimmable: a header plus 2-4 detail lines", () => {
  const body = formatReceiptComment({
    whyText: "Violated the no-PAN-in-logs rule.",
    changeSummary: "Masked the card number.",
  });
  assert.match(body, /^### /, "starts with a short markdown header");
  assert.match(body, /What was wrong:/);
  assert.match(body, /What I changed:/);
  assert.match(body, /Verification:/);
  assert.doesNotMatch(body, /```diff/, "no diff block when no diff is given");
});

test("formatReceiptComment embeds a collapsible before/after diff when provided", () => {
  const body = formatReceiptComment({
    whyText: "Violated the no-PAN-in-logs rule.",
    changeSummary: "Masked the card number.",
    diff: "- console.log(card.number)\n+ console.log('****' + card.number.slice(-4))",
  });
  assert.match(body, /<details>/, "diff is collapsible");
  assert.match(body, /```diff/, "renders a diff code block");
  assert.match(body, /card\.number\.slice\(-4\)/, "shows the actual rewrite");
});
