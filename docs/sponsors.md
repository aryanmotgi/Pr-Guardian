# Sponsor docs — fetch BEFORE writing any integration code

The sponsor SDKs are NOT reliably in Claude's training data. Before writing integration code, WebFetch the official docs and work from what you read. Do not guess methods, params, or endpoints. Paste the real URL next to each as you find it.

## Core (building with these)
- Daytona — isolated sandboxes.   Docs: 
- Kalibr — orchestration + retry. Docs: https://kalibr.systems/docs/quickstart · API ref: https://kalibr.systems/docs/api · Dashboard: https://dashboard.kalibr.systems
- Insforge — backend/DB/auth/event. Docs: https://docs.insforge.dev/introduction · SDK: https://docs.insforge.dev/sdks/typescript · Realtime: https://docs.insforge.dev/sdks/typescript/realtime
- Tigris — S3-compatible storage.  Docs: 
- Render — hosting.               Docs: 

## Also used
- GitHub API (Octokit).  Docs: https://docs.github.com/en/rest/issues/comments (create issue comment: POST /repos/{owner}/{repo}/issues/{issue_number}/comments, works on PRs, returns html_url) · https://octokit.github.io/rest.js/
- Anthropic API (Claude). Docs: 
- Slack API.             Docs: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks (incoming webhook: POST application/json {"text":"..."} → HTTP 200 body "ok"; Block Kit via "blocks" array with "text" as fallback)

## Bonus (pitch-only unless core loop done)
Opsera, NEAR AI, Brain2, Apify, Rtrvr.ai, Nebius, Lightsprint.ai
