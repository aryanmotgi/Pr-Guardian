#!/usr/bin/env node
// PR #2 — Decoy (ALLOW scenario)
//
// Creates branch pr-b/stripe-test-cards with a Stripe test card inside
// a test file (not production code), opens a PR, then fires /demo-scenario
// with scenario="allow" so the live screen shows the ALLOW outcome.
//
// Run: node scripts/demo-pr2.js
// Expected: agent reads context, recognizes it's test data, ALLOWs the PR.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const https = require("node:https");
const http  = require("node:http");

const OWNER      = "ssmoney1";
const REPO       = "acme-payments";
const HEAD       = "pr-b/stripe-test-cards";
const BASE       = "main";
const RENDER_URL = process.env.FIX_ENGINE_URL || "https://pr-guardian-fix-engine.onrender.com";

// A test file that references Stripe test cards — explicitly fake, no real data.
const TEST_FILE_CONTENT = `// tests/checkout.integration.test.js
// Stripe test cards per https://stripe.com/docs/testing — NOT real card numbers.
// These are published by Stripe and recognized by their sandbox only.

const STRIPE_TEST_CARDS = {
  visa:            '4242424242424242', // standard Stripe test Visa
  visaDebit:       '4000056655665556',
  mastercard:      '5555555555554444',
  amexSuccess:     '378282246310005',
  declineCard:     '4000000000000002', // always declines in sandbox
  insufficientFunds: '4000000000009995',
};

const { processCheckout } = require('../src/checkout');

describe('Checkout integration (Stripe sandbox)', () => {
  test('processes standard Visa test card', async () => {
    const result = await processCheckout({
      card: STRIPE_TEST_CARDS.visa,
      amount: 79.98,
      currency: 'USD',
    });
    expect(result.success).toBe(true);
  });

  test('handles decline gracefully', async () => {
    await expect(
      processCheckout({ card: STRIPE_TEST_CARDS.declineCard, amount: 10 })
    ).rejects.toThrow();
  });
});
`;

function ghRequest(path, method = "GET", body = null) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set in .env");
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: "api.github.com",
        path,
        method,
        headers: {
          "User-Agent": "pr-guardian-demo",
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
          catch { resolve({ status: res.statusCode, body: buf }); }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function postJson(url, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
          catch { resolve({ status: res.statusCode, body: buf }); }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function ensureBranch() {
  // Get main SHA
  const main = await ghRequest(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const sha  = main.body?.object?.sha;
  if (!sha) throw new Error("Could not get main SHA");

  // Try to create branch (ignore 422 = already exists)
  const create = await ghRequest(`/repos/${OWNER}/${REPO}/git/refs`, "POST", {
    ref: `refs/heads/${HEAD}`,
    sha,
  });
  if (create.status !== 201 && create.status !== 422) {
    throw new Error(`Branch create failed: ${create.body?.message}`);
  }

  // Put the test file on the branch (create or update)
  const existing = await ghRequest(
    `/repos/${OWNER}/${REPO}/contents/tests%2Fcheckout.integration.test.js?ref=${encodeURIComponent(HEAD)}`
  );
  const fileSha = existing.status === 200 ? existing.body.sha : undefined;
  const content = Buffer.from(TEST_FILE_CONTENT).toString("base64");

  const put = await ghRequest(
    `/repos/${OWNER}/${REPO}/contents/tests%2Fcheckout.integration.test.js`,
    "PUT",
    {
      message: "test: add Stripe sandbox card references",
      content,
      branch: HEAD,
      ...(fileSha ? { sha: fileSha } : {}),
    }
  );
  if (put.status !== 200 && put.status !== 201) {
    throw new Error(`File write failed: ${put.body?.message}`);
  }
  console.log("  Branch and file ready ✓");
}

async function closeExisting() {
  const list = await ghRequest(
    `/repos/${OWNER}/${REPO}/pulls?state=open&head=${OWNER}:${encodeURIComponent(HEAD)}&base=${BASE}`
  );
  for (const pr of list.body || []) {
    await ghRequest(`/repos/${OWNER}/${REPO}/pulls/${pr.number}`, "PATCH", { state: "closed" });
    console.log(`  Closed stale PR #${pr.number}`);
  }
}

async function run() {
  console.log("\n=== PR Guardian — Demo PR #2 (ALLOW / Decoy) ===\n");

  console.log("1. Setting up branch pr-b/stripe-test-cards…");
  await ensureBranch();

  console.log("2. Closing stale PRs…");
  await closeExisting();

  console.log("3. Opening PR…");
  const created = await ghRequest(`/repos/${OWNER}/${REPO}/pulls`, "POST", {
    title: "test: add Stripe sandbox card references for integration tests",
    body:  "Adds standard Stripe test card numbers to the integration test suite.\n\nAll cards from https://stripe.com/docs/testing — not real cards, sandbox only.",
    head:  HEAD,
    base:  BASE,
  });
  if (created.status !== 201) {
    throw new Error(`PR create failed: ${created.body?.message}`);
  }
  const pr = created.body;

  console.log("4. Firing /demo-scenario allow…");
  const resp = await postJson(`${RENDER_URL}/demo-scenario`, {
    scenario: "allow",
    pr: { number: pr.number, title: pr.title, owner: OWNER, repo: REPO },
  });
  if (resp.status !== 202) {
    throw new Error(`demo-scenario failed: ${JSON.stringify(resp.body)}`);
  }

  console.log("\n" + "─".repeat(56));
  console.log(`PR #${pr.number} opened ✓`);
  console.log(`Title:  ${pr.title}`);
  console.log(`PR URL: ${pr.html_url}`);
  console.log(`File:   https://github.com/${OWNER}/${REPO}/blob/${encodeURIComponent(HEAD)}/tests/checkout.integration.test.js`);
  console.log("─".repeat(56));
  console.log("\nSwitch to localhost:3001 — agent will ALLOW this PR.\n");
}

run().catch((err) => { console.error(err.message); process.exit(1); });
