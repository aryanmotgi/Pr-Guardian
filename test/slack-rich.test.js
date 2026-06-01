// Rich-message tests: each of the three Slack messages must tell a complete
// story on its own. Drives the full path (runMergeStage → slackForOutcome →
// notifySlack) so the smart fallbacks in index.js are exercised too. Uses the
// real runMergeStage input contract (violation.{rule,description,badCode},
// fix.{summary,diff,why,timeMs}, sandbox.{testsPassed,passed,total}).
// Fakes injected; no network, no creds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";

process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";
process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/fake";
process.env.SLACK_ESCALATION_MENTION = "<@U_ONCALL>";

const { runMergeStage } = await import("../src/index.js");
const { _setOctokit } = await import("../src/github.js");
const { _setFetch } = await import("../src/slack.js");

function install() {
  const slack = [];
  _setOctokit(
    new Octokit({
      auth: "test-token",
      request: {
        fetch: async (url) => {
          let data = {};
          let status = 200;
          if (/\/pulls\/\d+\/merge$/.test(url)) data = { merged: true, sha: "abc123" };
          else if (/\/issues\/\d+\/comments$/.test(url)) {
            data = { html_url: "https://github.com/x/y/pull/1#issuecomment-1" };
            status = 201;
          }
          return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
        },
      },
    })
  );
  _setFetch(async (url, opts = {}) => {
    slack.push({ url, body: JSON.parse(opts.body) });
    return new Response("ok", { status: 200 });
  });
  return { slack };
}

const blob = (msg) => JSON.stringify(msg.blocks);
const findActions = (blocks) => blocks.find((b) => b.type === "actions");

test("FIX message is a complete story: file+line, what was wrong, rule, time, tests, before/after, View PR", async () => {
  const { slack } = install();
  await runMergeStage({
    decision: "fix",
    repo: { owner: "acme", name: "acme-payments" },
    pr: { number: 42, url: "https://github.com/acme/acme-payments/pull/42" },
    violation: {
      file: "src/payment.js",
      line: 23,
      rule: "PCI-DSS: never log raw PAN",
      description: "logging the full card number",
    },
    fix: {
      summary: "Masked the card number to its last 4 digits before logging",
      diff: "- console.log(card.number)\n+ console.log(mask(card.number))",
      timeMs: 8200,
    },
    sandbox: { testsPassed: true, passed: 6, total: 6 },
  });

  const msg = slack[0].body;
  const b = blob(msg);
  assert.match(b, /src\/payment\.js:23/, "shows file + line");
  assert.match(b, /logging the full card number/, "says what the bad code was doing");
  assert.match(b, /PCI-DSS: never log raw PAN/, "names the rule violated");
  assert.match(b, /Masked the card number/, "says what the fix did");
  assert.match(b, /fixed in 8\.2s/, "shows how long it took");
  assert.match(b, /6\/6 tests passed/, "shows the test count");
  assert.match(b, /mask\(card\.number\)/, "embeds the before/after change inline");
  assert.equal(findActions(msg.blocks).elements[0].text.text, "View PR");
  assert.equal(findActions(msg.blocks).elements[0].style, "primary");
});

test("ESCALATE message is a complete story: file, violation, rule, why-not-fixed, severity, @here, Review PR (danger)", async () => {
  const { slack } = install();
  await runMergeStage({
    decision: "escalate",
    repo: { owner: "acme", name: "acme-payments" },
    pr: { number: 44, url: "https://github.com/acme/acme-payments/pull/44" },
    violation: {
      file: "src/server.js",
      line: 31,
      rule: "No hardcoded secrets / API keys in source",
      description: "a high-entropy string assigned to const KEY",
      badCode: 'const KEY = "sk-live-..."',
    },
    fix: { why: "Can't tell if this is a live key or a placeholder — a human should decide" },
    sandbox: null,
  });

  const msg = slack[0].body;
  const b = blob(msg);
  assert.match(b, /src\/server\.js:31/, "shows the file with the violation");
  assert.match(b, /No hardcoded secrets/, "names the rule that was broken");
  assert.match(b, /Why I couldn't auto-fix it/, "explains why it couldn't be auto-fixed");
  assert.match(b, /Can't tell if this is a live key/, "gives the specific reason it stopped");
  assert.match(b, /Offending code/, "includes the offending-code block");
  assert.match(b, /const KEY = .*sk-live/, "shows the offending code");
  assert.match(msg.text, /🔴 HIGH/, "carries a severity badge (secret → HIGH)");
  assert.match(msg.text, /<@U_ONCALL>/, "@-mentions a human");
  const btn = findActions(msg.blocks).elements[0];
  assert.equal(btn.text.text, "Review PR");
  assert.equal(btn.style, "danger");
});

test("ALLOW message is quiet but informative: file, what was checked, 'compliant', no button, no @-mention", async () => {
  const { slack } = install();
  await runMergeStage({
    decision: "allow",
    repo: { owner: "acme", name: "acme-payments" },
    pr: { number: 43, url: "https://github.com/acme/acme-payments/pull/43" },
    violation: {
      file: "tests/checkout.test.js",
      line: 7,
      rule: "No full PAN in logs",
      description: "contains 4242 4242 4242 4242",
    },
    fix: { why: "a well-known fake test card used as fixture data — not a real leak" },
    sandbox: null,
  });

  const msg = slack[0].body;
  const b = blob(msg);
  assert.match(b, /tests\/checkout\.test\.js/, "names the file reviewed");
  assert.match(b, /compliant, no action needed/, "states the verdict in one line");
  assert.match(b, /checked: No full PAN in logs/, "says what was checked");
  assert.match(b, /not a real leak/, "explains why it's allowed");
  assert.equal(findActions(msg.blocks), undefined, "no buttons in the quiet allow message");
  assert.doesNotMatch(msg.text, /<@|<!/, "no @-mention in allow");
});
