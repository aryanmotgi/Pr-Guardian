#!/usr/bin/env node
// PR #3 — Ambiguous (ESCALATE scenario)
//
// Creates branch pr-c/hardcoded-key with a hardcoded AES key baked into
// production config. The agent detects it but cannot safely auto-fix it
// (rotating a live encryption key requires coordination, not a line swap).
// After 3 failed sandbox attempts, it escalates to a human.
//
// Run: node scripts/demo-pr3.js
// Expected: 3 attempts → all fail → ESCALATED, human notified.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const https = require("node:https");
const http  = require("node:http");

const OWNER      = "ssmoney1";
const REPO       = "acme-payments";
const HEAD       = "pr-c/hardcoded-key";
const BASE       = "main";
const RENDER_URL = process.env.FIX_ENGINE_URL || "https://pr-guardian-fix-engine.onrender.com";

// Production config with a hardcoded AES-256 key — plausible dev shortcut
// that's genuinely risky: rotating the key requires re-encrypting all stored
// data, so a line-swap fix would break production. Perfect escalation scenario.
const CONFIG_FILE_CONTENT = `// src/config.js
// Payment processor configuration

const config = {
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret:  process.env.STRIPE_WEBHOOK_SECRET,
  },

  // AES-256 key for encrypting card tokens at rest
  // TODO: pull from secrets manager before release — blocked on infra ticket #1847
  encryptionKey: 'f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',

  tokenExpiry: 3600,
  maxRetries:  3,
};

module.exports = config;
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
  const main = await ghRequest(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  const sha  = main.body?.object?.sha;
  if (!sha) throw new Error("Could not get main SHA");

  const create = await ghRequest(`/repos/${OWNER}/${REPO}/git/refs`, "POST", {
    ref: `refs/heads/${HEAD}`,
    sha,
  });
  if (create.status !== 201 && create.status !== 422) {
    throw new Error(`Branch create failed: ${create.body?.message}`);
  }

  const existing = await ghRequest(
    `/repos/${OWNER}/${REPO}/contents/src%2Fconfig.js?ref=${encodeURIComponent(HEAD)}`
  );
  const fileSha = existing.status === 200 ? existing.body.sha : undefined;
  const content = Buffer.from(CONFIG_FILE_CONTENT).toString("base64");

  const put = await ghRequest(
    `/repos/${OWNER}/${REPO}/contents/src%2Fconfig.js`,
    "PUT",
    {
      message: "config: add encryption key for card token storage",
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
  console.log("\n=== PR Guardian — Demo PR #3 (ESCALATE / Ambiguous) ===\n");

  console.log("1. Setting up branch pr-c/hardcoded-key…");
  await ensureBranch();

  console.log("2. Closing stale PRs…");
  await closeExisting();

  console.log("3. Opening PR…");
  const created = await ghRequest(`/repos/${OWNER}/${REPO}/pulls`, "POST", {
    title: "config: add AES-256 encryption key for card token storage",
    body:  "Adds encryption key config needed for the card tokenisation feature.\n\nKey rotation is tracked in infra ticket #1847 — using hardcoded value for now.",
    head:  HEAD,
    base:  BASE,
  });
  if (created.status !== 201) {
    throw new Error(`PR create failed: ${created.body?.message}`);
  }
  const pr = created.body;

  console.log("4. Firing /demo-scenario escalate…");
  const resp = await postJson(`${RENDER_URL}/demo-scenario`, {
    scenario: "escalate",
    pr: { number: pr.number, title: pr.title, owner: OWNER, repo: REPO },
  });
  if (resp.status !== 202) {
    throw new Error(`demo-scenario failed: ${JSON.stringify(resp.body)}`);
  }

  console.log("\n" + "─".repeat(56));
  console.log(`PR #${pr.number} opened ✓`);
  console.log(`Title:  ${pr.title}`);
  console.log(`PR URL: ${pr.html_url}`);
  console.log(`File:   https://github.com/${OWNER}/${REPO}/blob/${encodeURIComponent(HEAD)}/src/config.js`);
  console.log("─".repeat(56));
  console.log("\nSwitch to localhost:3001 — agent will attempt 3 fixes, fail, and ESCALATE.\n");
  console.log("Why escalate: rotating a live encryption key requires re-encrypting all");
  console.log("stored data. A single-line swap would break production. Needs a human.\n");
}

run().catch((err) => { console.error(err.message); process.exit(1); });
