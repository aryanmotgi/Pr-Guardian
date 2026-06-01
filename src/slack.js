// Slack side of the close-of-loop: the ping that announces a merged auto-fix.
//
// Transport is a Slack INCOMING WEBHOOK (not the Web API), verified against the
// official docs (see docs/sponsors.md):
//   POST application/json  { "text": "..." }  →  HTTP 200, body literally "ok"
// The webhook URL is a secret read from env SLACK_WEBHOOK_URL — never commit it.

import { config } from "./config.js";

const WEBHOOK_ENV = "SLACK_WEBHOOK_URL";

// Test seam: swap the fetch implementation so tests can assert the payload
// without hitting the network. Pass null to restore the real global fetch.
let _fetch = (...args) => fetch(...args);
export function _setFetch(fn) {
  _fetch = fn || ((...args) => fetch(...args));
}

// Low-level primitive every Slack message goes through. Reuses the shared
// dry-run guard so the team can work without a webhook; in live mode it fails
// LOUDLY if the webhook URL is missing rather than dropping the message.
// `blocks` is optional Block Kit; `text` is always sent as the fallback.
export async function sendSlack(text, blocks) {
  if (config.dryRun) {
    console.log("📣 [dry-run] slack.send → (would POST to SLACK_WEBHOOK_URL)");
    console.log(indent(text));
    if (blocks) console.log(indent("blocks: " + JSON.stringify(blocks)));
    return { dryRun: true };
  }

  const url = process.env[WEBHOOK_ENV];
  if (!url) {
    throw new Error(
      `${WEBHOOK_ENV} is not set — cannot send the Slack ping. Set it in your env ` +
        `(do not commit it), or run in dry-run (unset DRY_RUN).`
    );
  }

  const payload = blocks ? { text, blocks } : { text };
  const res = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // A Slack incoming webhook returns HTTP 200 with the body "ok" on success.
  const body = (await res.text()).trim();
  if (!res.ok || body !== "ok") {
    throw new Error(`Slack webhook rejected the message: HTTP ${res.status} "${body}"`);
  }
  return { ok: true, status: res.status };
}

// Public API — announce an outcome to the channel.
//   input:  { summary, prUrl, outcome?, testsPassed?, testsTotal?, mention?, rule? }
//   output: { ok, status } on a live send, or { dryRun: true } in dry-run.
//
// Tone differs by `outcome` (default "fix"):
//   fix      → green "Auto-fixed & merged" card (+ optional test count + View PR)
//   allow    → a quiet, no-alert line (no @-mention, no button)
//   escalate → a warning alert that @-mentions a human and names the rule
// The plain one-liner is always sent as `text` — Slack's required fallback.
export async function notifySlack({
  summary,
  prUrl,
  outcome = "fix",
  testsPassed,
  testsTotal,
  mention,
  rule,
  severity,
  location,
  change,
  problem, // fix: what the bad code was doing
  whyCantFix, // escalate: why the agent stopped instead of fixing
  checked, // allow: which rule was checked
  timeMs, // fix: how long the fix took
} = {}) {
  if (!summary || !prUrl) {
    throw new Error("notifySlack requires { summary, prUrl }");
  }

  if (outcome === "escalate") {
    const sev = severityLabel(severity);
    const text = `${mention ? mention + " " : ""}⚠️ ${sev ? sev + " · " : ""}Needs human review — caught a violation I couldn't auto-fix safely: ${summary} ${prUrl}`;
    return sendSlack(text, buildEscalateBlocks({ summary, prUrl, mention, rule, whyCantFix, sev, location, change }));
  }

  if (outcome === "allow") {
    const text = `✅ Reviewed — compliant, no action needed: ${summary} ${prUrl}`;
    return sendSlack(text, buildAllowBlocks({ summary, checked, prUrl, location }));
  }

  // outcome === "fix" (default)
  const text = `✅ Auto-fixed & merged: ${summary} ${prUrl}`;
  return sendSlack(text, buildMergedBlocks({ summary, problem, rule, prUrl, testsPassed, testsTotal, timeMs, location, change }));
}

// Severity badge for escalations, so a human can triage at a glance.
const SEVERITY = { high: "🔴 HIGH", medium: "🟠 MEDIUM", low: "🟡 LOW" };
function severityLabel(severity) {
  return SEVERITY[String(severity || "").toLowerCase()] || null;
}

// ESCALATE — a warning alert. The @-mention lives in both the fallback text and
// the section so Slack actually notifies the human; the button is red (danger).
function buildEscalateBlocks({ summary, prUrl, mention, rule, whyCantFix, sev, location, change }) {
  // A bold `header` block makes the red alert pop on the live demo screen — far
  // louder than inline bold text — and keeps the severity badge front and centre.
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `🚨 Human review needed${sev ? ` · ${sev}` : ""}`, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*Couldn't auto-fix this safely.* ${summary}` } },
  ];

  const meta = [];
  if (adds(rule, summary)) meta.push(`*Rule violated:* ${rule}`);
  if (location) meta.push(`📍 ${location}`);
  if (meta.length) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: meta.join("  ·  ") }] });

  // The crucial line for the human: WHY the agent stopped instead of fixing.
  if (adds(whyCantFix, summary)) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Why I couldn't auto-fix it:* ${whyCantFix}` } });
  }

  if (change) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Offending code:*\n${codeBlock(change)}` } });
  }

  // @-mention in its own section so Slack reliably notifies the human.
  if (mention) blocks.push({ type: "section", text: { type: "mrkdwn", text: `${mention} — please take a look.` } });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Review PR" },
        url: prUrl,
        action_id: "review_pr",
        style: "danger",
      },
    ],
  });
  return blocks;
}

// ALLOW — a single quiet context line. No @-mention, no button, no alarm —
// but it still names the file, what was checked, and the compliant verdict.
function buildAllowBlocks({ summary, checked, prUrl, location }) {
  const parts = ["✅ Reviewed — compliant, no action needed"];
  if (summary) parts.push(summary);
  if (location) parts.push(`📍 ${location}`);
  if (adds(checked, summary)) parts.push(`checked: ${checked}`);
  parts.push(`<${prUrl}|PR>`);
  return [{ type: "context", elements: [{ type: "mrkdwn", text: parts.join(" · ") }] }];
}

// FIX — the green merged card. Self-contained: location + a compact before/after
// so a reader gets the whole story in Slack without opening the PR.
function buildMergedBlocks({ summary, problem, rule, prUrl, testsPassed, testsTotal, timeMs, location, change }) {
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: `✅ *Auto-fixed & merged*\n${summary}` } },
  ];

  const meta = [];
  if (location) meta.push(`📍 ${location}`);
  if (typeof testsTotal === "number") {
    const passed = typeof testsPassed === "number" ? testsPassed : testsTotal;
    meta.push(`🧪 ${passed}/${testsTotal} tests passed · verified in an isolated sandbox`);
  }
  const secs = seconds(timeMs);
  if (secs) meta.push(`⏱ fixed in ${secs}`);
  if (meta.length) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: meta.join("  ·  ") }] });

  // What was wrong + which rule — only when each ADDS something the summary
  // doesn't already say (stops one repeated string showing three times).
  const detail = [];
  if (adds(problem, summary)) detail.push(`*What was wrong:* ${problem}`);
  if (adds(rule, `${summary} ${problem || ""}`)) detail.push(`*Rule:* ${rule}`);
  if (detail.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: detail.join("\n") } });

  if (change) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Change:*\n${codeBlock(change)}` } });
  }

  // A url button opens the PR in the browser. Per Slack docs, url buttons still
  // emit an interaction payload, but with an incoming webhook (no interactivity
  // endpoint) the link opens fine — we simply don't ack it.
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View PR" },
        url: prUrl,
        action_id: "view_pr",
        style: "primary",
      },
    ],
  });

  return blocks;
}

// Wrap a snippet in a Slack mrkdwn code fence.
function codeBlock(text) {
  return "```\n" + String(text).trim() + "\n```";
}

// time_ms → "8.2s" (or null if we weren't given a usable number — never "NaNs").
function seconds(timeMs) {
  const n = Number(timeMs);
  return Number.isFinite(n) && n > 0 ? `${(n / 1000).toFixed(1)}s` : null;
}

// Show a secondary field only when it ADDS information — i.e. the value exists
// and the text we've already shown doesn't already contain it. Stops the message
// repeating the same sentence when the fix engine sends one string for several
// slots (rule == reason == summary).
function adds(value, alreadyShown) {
  return Boolean(value) && !(alreadyShown || "").includes(value);
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "   │ " + l)
    .join("\n");
}
