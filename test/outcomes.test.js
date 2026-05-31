// Proves the three outcomes BEHAVE differently in their messaging, end-to-end
// through runMergeStage. Captures both the GitHub calls (to prove no merge on
// allow/escalate) and the Slack payload (to prove escalate alerts + @-mentions
// a human, while allow stays quiet). Real Octokit + injected fetch; no network.

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
const { fixtures } = await import("../src/fixtures.js");

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
            data = { merged: true, sha: "s" };
          } else if (/\/issues\/\d+\/comments$/.test(url)) {
            data = { html_url: "https://github.com/x/y/pull/1#issuecomment-1" };
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
const commentFor = (gh, pr) => gh.find((c) => new RegExp(`/issues/${pr}/comments$`).test(c.url));

test("ESCALATE: @-mentions a human, alerts (not the green card), and does NOT merge", async () => {
  const { gh, slack } = install();
  const out = await runMergeStage(fixtures.escalate);

  console.log("\n[escalate] slack text:", slack[0].body.text);

  // never merges
  assert.equal(mergeCalls(gh).length, 0, "escalate must not merge");
  assert.equal(out.merged, false);

  // receipt flags it for a human and names the violated rule
  const comment = commentFor(gh, 44);
  assert.ok(comment, "escalate posts a receipt");
  assert.match(comment.body.body, /needs human review/i);
  assert.match(comment.body.body, /No hardcoded secrets/); // the rule from the fixture

  // slack: one alert that @-mentions a human and is NOT the green merged card
  assert.equal(slack.length, 1);
  const msg = slack[0].body;
  assert.match(msg.text, /<@U_ONCALL>/, "@-mentions a human");
  assert.match(msg.text, /human review/i);
  assert.doesNotMatch(msg.text, /Auto-fixed & merged/);
  const actions = msg.blocks.find((b) => b.type === "actions");
  assert.equal(actions.elements[0].style, "danger", "alert-styled (red) button");

  // severity badge for triage — the fixture's rule mentions "secrets" → HIGH
  assert.match(msg.text, /🔴 HIGH/, "tags the alert with a severity for triage");
  assert.match(msg.blocks[0].text.text, /HIGH/);
});

test("ALLOW: posts a quiet receipt, does NOT merge, and sends NO alert (no @-mention)", async () => {
  const { gh, slack } = install();
  const out = await runMergeStage(fixtures.allow);

  console.log("[allow] slack text:", slack[0].body.text);

  // never merges
  assert.equal(mergeCalls(gh).length, 0, "allow must not merge");
  assert.equal(out.merged, false);

  // quiet, compliant receipt
  const comment = commentFor(gh, 43);
  assert.ok(comment, "allow posts a receipt");
  assert.match(comment.body.body, /compliant, no action needed/i);

  // slack: quiet — no @-mention, no alert styling, not the merged card
  assert.equal(slack.length, 1);
  const msg = slack[0].body;
  assert.doesNotMatch(msg.text, /<!|<@/, "no @-mention / no alert");
  assert.doesNotMatch(msg.text, /Auto-fixed & merged/);
  assert.match(msg.text, /compliant, no action needed/i);
  const hasDangerButton = (msg.blocks || []).some((b) =>
    (b.elements || []).some((e) => e.style === "danger")
  );
  assert.equal(hasDangerButton, false, "allow has no alert button");
});

test("FIX: green card is self-contained — location + before/after readable in Slack", async () => {
  const { gh, slack } = install();
  const out = await runMergeStage(fixtures.fix);

  assert.equal(mergeCalls(gh).length, 1, "fix merges");
  assert.equal(out.merged, true);
  assert.match(slack[0].body.text, /Auto-fixed & merged/);
  assert.doesNotMatch(slack[0].body.text, /<!|<@/, "no @-mention on success");

  // The reader can see WHERE and WHAT changed without opening the PR.
  const allText = JSON.stringify(slack[0].body.blocks);
  assert.match(allText, /📍 src\/payment\.js:18/, "shows the location");
  assert.match(allText, /```/, "embeds the change as a code block");
  assert.match(allText, /card\.number\.slice\(-4\)/, "shows the actual change");
});
