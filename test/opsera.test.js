// The Opsera DevSecOps gate, wired into closeLoop. Proves:
//   - gate PASSES → the fix merges (as before)
//   - gate FAILS  → NO merge, downgraded to escalate, receipt + Slack flag Opsera
//   - live mode without OPSERA_API_KEY fails loudly
// Real Octokit (injected fetch) + Slack _setFetch + an injected Opsera transport.
// No network, no creds. The gate is turned ON for this file via OPSERA_GATE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";

process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";
process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/fake";
process.env.SLACK_ESCALATION_MENTION = "<@U_ONCALL>";
process.env.OPSERA_GATE = "true"; // turn the gate ON for this file only

const { closeLoop } = await import("../src/close-loop.js");
const { _setOctokit } = await import("../src/github.js");
const { _setFetch } = await import("../src/slack.js");
const { validateWithOpsera, _setOpseraTransport } = await import("../src/opsera.js");

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
            data = { html_url: "https://github.com/ssmoney1/acme-payments/pull/1#issuecomment-9" };
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

const mergeCalls = (gh) => gh.filter((c) => /\/merge$/.test(c.url));
const comment = (gh) => gh.find((c) => /\/issues\/\d+\/comments$/.test(c.url));

const prBase = {
  owner: "ssmoney1",
  repo: "acme-payments",
  number: 1,
  title: "Add charge logging",
  violation: {
    file: "src/payment.js",
    line: 18,
    reason: "Logs the full card number (PAN) — violates no-PAN-in-logs",
    bad_code: "console.log(card.number)",
  },
};

const greenFix = {
  escalate: false,
  time_ms: 8200,
  tests: { passed: 6, total: 6 },
  before: 'console.log("Charging card " + card.number);',
  after: 'console.log("Charging card ****" + card.number.slice(-4));',
};

test("Opsera PASSES → a green fix still merges", async () => {
  const { gh, slack } = install();
  _setOpseraTransport(async () => ({ passed: true, findings: [] }));

  const out = await closeLoop({ pr: prBase, result: greenFix });

  assert.equal(mergeCalls(gh).length, 1, "passes the gate → merges");
  assert.equal(out.outcome, "fix");
  assert.equal(out.merged, true);
  assert.equal(out.opsera.passed, true);
  assert.match(slack[0].body.text, /Auto-fixed & merged/);

  _setOpseraTransport(null);
});

test("Opsera FAILS → NO merge, downgraded to escalate, receipt + Slack flag Opsera", async () => {
  const { gh, slack } = install();
  _setOpseraTransport(async () => ({
    passed: false,
    findings: [
      {
        id: "OPSERA-001",
        severity: "high",
        framework: "SOC2",
        rule: "Sensitive data must not reach logs",
        file: "src/payment.js",
        message: "Residual PAN exposure in a sibling log line the fix did not cover",
      },
    ],
  }));

  const out = await closeLoop({ pr: prBase, result: greenFix });

  // even though tests were green, the compliance gate blocks the merge
  assert.equal(mergeCalls(gh).length, 0, "fails the gate → must NOT merge");
  assert.equal(out.outcome, "escalate");
  assert.equal(out.merged, false);
  assert.equal(out.downgradedFrom, "fix");
  assert.match(out.downgradeReason, /Opsera/i);
  assert.equal(out.opsera.passed, false);
  assert.equal(out.opsera.findings.length, 1);

  // the receipt names the Opsera finding
  const body = comment(gh).body.body;
  assert.match(body, /Opsera/i);
  assert.match(body, /Residual PAN exposure/);

  // Slack escalates: @-mention a human, red button, Opsera surfaced
  const msg = slack[0].body;
  assert.match(msg.text, /<@U_ONCALL>/, "@-mentions a human");
  assert.match(JSON.stringify(msg.blocks), /Opsera/i, "Slack names Opsera");
  assert.equal(msg.blocks.find((b) => b.type === "actions").elements[0].style, "danger");

  _setOpseraTransport(null);
});

test("live mode without OPSERA_API_KEY fails loudly", async () => {
  // No injected transport → the default transport runs; live + no key must throw.
  _setOpseraTransport(null);
  delete process.env.OPSERA_API_KEY;
  await assert.rejects(
    () => validateWithOpsera({ pr: prBase, result: greenFix }),
    /OPSERA_API_KEY is not set/
  );
});
