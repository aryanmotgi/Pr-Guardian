#!/usr/bin/env node
// Demo trigger — run `npm run demo:pr1` to kick off the violation pipeline.
// Creates a fresh PR on ssmoney1/acme-payments from demo/violation → main,
// then POSTs to Render /fix so the live screen shows the full pipeline.

require("dotenv").config();
const https = require("node:https");

const RENDER_FIX = "https://pr-guardian-fix-engine.onrender.com/fix";
const OWNER      = "ssmoney1";
const REPO       = "acme-payments";
const HEAD       = "demo/violation";
const BASE       = "main";
const VIOLATION  = {
  file:     "src/payment.js",
  reason:   "logs full card number",
  line:     23,
  bad_code: "    cardNumber: pan,",
};

function ghRequest(path, method = "GET", body = null) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set in .env");
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      { hostname: "api.github.com", path, method,
        headers: { "User-Agent": "pr-guardian-demo", Authorization: `token ${token}`,
          "Content-Type": "application/json", Accept: "application/vnd.github.v3+json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } },
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

function postFix(payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const url = new URL(RENDER_FIX);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Clean payment.js — what main should have before the demo PR introduces the violation
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

async function resetMain() {
  // Get current SHA of src/payment.js on main so we can update it
  const current = await ghRequest(`/repos/${OWNER}/${REPO}/contents/src%2Fpayment.js?ref=main`);
  if (current.status !== 200) {
    console.warn("Could not fetch payment.js SHA — skipping main reset");
    return;
  }
  const sha = current.body.sha;
  const content = Buffer.from(CLEAN_PAYMENT_JS).toString("base64");
  const update = await ghRequest(`/repos/${OWNER}/${REPO}/contents/src%2Fpayment.js`, "PUT", {
    message: "chore: reset demo — clean PAN masking before violation PR",
    content,
    sha,
    branch: "main",
  });
  if (update.status === 200) {
    console.log("main reset to clean code ✓");
  } else {
    console.warn("main reset failed:", update.body?.message ?? update.status);
  }
}

async function run() {
  console.log("\n=== PR Guardian — Demo Trigger ===\n");

  // 0. Reset main to clean state so the fix engine has something meaningful to fix
  console.log("Resetting main to clean state…");
  await resetMain();

  // 1. Find open PR from demo/violation, or create one
  console.log(`\nChecking for open PR: ${HEAD} → ${BASE}…`);
  const list = await ghRequest(`/repos/${OWNER}/${REPO}/pulls?state=open&head=${OWNER}:${HEAD}&base=${BASE}`);
  let pr;

  if (list.body.length > 0) {
    pr = list.body[0];
    console.log(`Found existing PR #${pr.number}: ${pr.title}`);
  } else {
    console.log("No open PR found — creating one…");
    const created = await ghRequest(`/repos/${OWNER}/${REPO}/pulls`, "POST", {
      title: "feat: add payment debug logging",
      body:  "Adds verbose debug logging to help troubleshoot failed payment attempts.",
      head:  HEAD,
      base:  BASE,
    });
    if (created.status !== 201) {
      console.error("Failed to create PR:", created.body);
      process.exit(1);
    }
    pr = created.body;
    console.log(`Created PR #${pr.number}: ${pr.title}`);
  }

  console.log(`PR URL: ${pr.html_url}\n`);

  // 2. Fire the fix engine
  const payload = {
    pr: { owner: OWNER, repo: REPO, number: pr.number, title: pr.title },
    violation: VIOLATION,
  };

  console.log("Firing POST to Render /fix…");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("\nWatch the live screen: http://localhost:3001\n");

  const resp = await postFix(payload);
  console.log(`Render responded: HTTP ${resp.status}`);

  // /fix streams SSE — first line tells us the job was accepted
  const firstLine = resp.body.split("\n").find((l) => l.startsWith("data:"));
  if (firstLine) {
    try {
      const evt = JSON.parse(firstLine.slice(5));
      console.log("Job ID:", evt.jobId ?? "(not found in first event)");
    } catch { /* ignore */ }
  }

  console.log("\nPipeline running — watch localhost:3001 for live steps.");
}

run().catch((err) => {
  console.error("Demo trigger failed:", err.message);
  process.exit(1);
});
