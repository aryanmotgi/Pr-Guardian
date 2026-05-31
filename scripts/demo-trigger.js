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

async function run() {
  console.log("\n=== PR Guardian — Demo Trigger ===\n");

  // 1. Find open PR from demo/violation, or create one
  console.log(`Checking for open PR: ${HEAD} → ${BASE}…`);
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
