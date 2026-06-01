#!/usr/bin/env node
// Demo script — PR #1 (real violation → fix → merge).
//
// Flow:
//   1. Reset main to CLEAN code
//   2. Close any stale PR from pr-a/log-card-debug
//   3. Open fresh PR
//   4. POST violation directly to fix engine (no webhook dependency)
//
// Run: node scripts/demo-open-pr.js
// Local:  FIX_ENGINE_URL=http://localhost:3000 node scripts/demo-open-pr.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const https = require("node:https");
const http  = require("node:http");

const OWNER     = "ssmoney1";
const REPO      = "acme-payments";
const HEAD      = "pr-a/log-card-debug";
const BASE      = "main";
const PR_TITLE  = "feat: add payment debug logging";
const PR_BODY   = "Adds verbose debug logging to help troubleshoot failed payment attempts in production.\n\nFixes a lot of support tickets where we can't see what card data was submitted.";
const FIX_URL   = `${process.env.FIX_ENGINE_URL || "https://pr-guardian-fix-engine.onrender.com"}/fix`;

const VIOLATION = {
  file:     "src/payment.js",
  reason:   "logs full card number — PCI-DSS violation",
  line:     23,
  bad_code: "  logger.debug('Payment card data', { cardNumber: pan, amount, currency });",
};

const CLEAN_PAYMENT_JS = `const logger = require('./logger');

function maskPan(pan) {
  // Show only last 4 digits — rule: never log full PAN
  const stripped = String(pan).replace(/\\s/g, '');
  const masked = stripped.replace(/\\d(?=\\d{4})/g, '*');
  return String(pan).includes(' ') ? masked.match(/.{1,4}/g).join(' ') : masked;
}

function processPayment({ cardNumber, amount, currency = 'USD' }) {
  if (!cardNumber || String(cardNumber).replace(/\\s/g, '').length < 13) {
    throw new Error('Invalid card number');
  }
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }

  const pan = String(cardNumber).replace(/\\s/g, '');

  // Log masked card only — never the full PAN
  logger.info('Processing payment', {
    last4: pan.slice(-4),
    amount,
    currency,
  });

  const transactionId = \`txn_\${Date.now()}_\${pan.slice(-4)}\`;
  logger.info('Payment authorized', { transactionId, amount, currency });

  return { success: true, transactionId, amount, currency };
}

module.exports = { processPayment, maskPan };
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

// HTTP or HTTPS based on URL — fix engine may be on http://localhost
function postFix(url, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        // /fix returns SSE — just drain it so the connection closes cleanly
        res.on("data", () => {});
        res.on("end", () => resolve({ status: res.statusCode }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function resetMain() {
  const current = await ghRequest(`/repos/${OWNER}/${REPO}/contents/src%2Fpayment.js?ref=main`);
  if (current.status !== 200) {
    console.warn("  Could not fetch payment.js on main — skipping reset");
    return;
  }
  const sha     = current.body.sha;
  const content = Buffer.from(CLEAN_PAYMENT_JS).toString("base64");
  const update  = await ghRequest(`/repos/${OWNER}/${REPO}/contents/src%2Fpayment.js`, "PUT", {
    message: "chore: reset demo — clean PAN masking (no violation)",
    content,
    sha,
    branch: "main",
  });
  if (update.status === 200) {
    console.log("  main reset to clean code ✓");
  } else {
    console.warn("  main reset failed:", update.body?.message ?? update.status);
  }
}

async function closeExistingPRs() {
  const list = await ghRequest(
    `/repos/${OWNER}/${REPO}/pulls?state=open&head=${OWNER}:${encodeURIComponent(HEAD)}&base=${BASE}`
  );
  if (!Array.isArray(list.body) || list.body.length === 0) return;
  for (const pr of list.body) {
    await ghRequest(`/repos/${OWNER}/${REPO}/pulls/${pr.number}`, "PATCH", { state: "closed" });
    console.log(`  Closed stale PR #${pr.number}`);
  }
}

async function run() {
  console.log("\n=== PR Guardian — Demo PR #1 (VIOLATION → FIX) ===\n");
  console.log(`Fix engine: ${FIX_URL}\n`);

  console.log("1. Resetting main to clean code…");
  await resetMain();

  console.log("2. Closing stale PRs…");
  await closeExistingPRs();

  console.log("3. Opening PR…");
  const created = await ghRequest(`/repos/${OWNER}/${REPO}/pulls`, "POST", {
    title: PR_TITLE,
    body:  PR_BODY,
    head:  HEAD,
    base:  BASE,
  });

  if (created.status !== 201) {
    console.error("Failed to open PR:", created.body?.message ?? created.body);
    process.exit(1);
  }

  const pr = created.body;

  console.log("4. POSTing violation to fix engine…");
  const resp = await postFix(FIX_URL, {
    pr: { owner: OWNER, repo: REPO, number: pr.number, title: pr.title },
    violation: VIOLATION,
  });

  console.log(`   Fix engine responded: HTTP ${resp.status}`);

  console.log("\n" + "─".repeat(56));
  console.log(`PR #${pr.number} opened ✓`);
  console.log(`PR URL:   ${pr.html_url}`);
  console.log(`Bad line: https://github.com/${OWNER}/${REPO}/blob/pr-a%2Flog-card-debug/src/payment.js#L23`);
  console.log("─".repeat(56));
  console.log("\nSwitch to localhost:3001 — agent is running.\n");
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
