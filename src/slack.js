// Slack side of the merge stage: the ping that announces what the agent did.
//
// HONESTY NOTE (per CLAUDE.md): uses @slack/web-api's chat.postMessage, the
// standard method. Confirm at https://tools.slack.dev/node-slack-sdk/ before
// the live demo.

import { WebClient } from "@slack/web-api";
import { config, canCallSlack } from "./config.js";

let _client = null;
function client() {
  if (!_client) _client = new WebClient(config.slack.token);
  return _client;
}

const DECISION_EMOJI = { fix: "🛡️", allow: "✅", escalate: "⚠️" };

// Sends a short summary message to the configured channel.
// input: the merge-stage contract; result: { merged, url } from the github step.
export async function notifySlack(input, result = {}) {
  const text = buildMessage(input, result);

  if (config.dryRun || !canCallSlack()) {
    console.log("📣 [dry-run] slack.notify →", config.slack.channel || "(no channel set)");
    console.log(
      text
        .split("\n")
        .map((l) => "   │ " + l)
        .join("\n")
    );
    return { dryRun: true };
  }

  // ASSUMPTION: chat.postMessage param names (channel, text).
  const res = await client().chat.postMessage({
    channel: config.slack.channel,
    text,
  });
  return { ts: res.ts };
}

function buildMessage(input, result) {
  const { decision, confidence, repo, pr, violation } = input;
  const emoji = DECISION_EMOJI[decision] || "🤖";
  const prRef = `${repo.owner}/${repo.name}#${pr.number}`;
  const conf = typeof confidence === "number" ? ` (${Math.round(confidence * 100)}% confident)` : "";

  if (decision === "fix") {
    return `${emoji} *PR Guardian fixed & merged* ${prRef}${conf}\n> ${violation?.rule || "rule violation"} — ${input.fix?.summary || "auto-fixed"}\n${pr.url || ""}`.trim();
  }
  if (decision === "allow") {
    return `${emoji} *PR Guardian allowed* ${prRef}${conf}\n> ${input.fix?.why || "No real violation."}\n${pr.url || ""}`.trim();
  }
  if (decision === "escalate") {
    return `${emoji} *PR Guardian needs a human* ${prRef}${conf}\n> ${violation?.description || "Low confidence — please review."}\n${pr.url || ""}`.trim();
  }
  return `${emoji} PR Guardian processed ${prRef}`;
}
