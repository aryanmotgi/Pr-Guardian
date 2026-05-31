# CLAUDE.md — PR Guardian (hackathon)

Autonomous agent that guards a codebase. A PR opens -> a webhook wakes the agent -> it reads the diff, checks it against our rules, and judges: real violation, false alarm, or unsure. On a real violation it spins up a sandbox, rewrites the bad code, runs tests, retries until green, merges, posts a receipt, and pings Slack. The point is judgment, not a script: it chooses fix-and-merge / allow / escalate-to-human based on confidence.

## The core loop (this IS the product)
Trigger -> decide -> fix -> test -> merge -> prove -> announce.
webhook -> read PR -> check rules -> decide(violation | false-alarm | unsure) -> if violation: sandbox -> rewrite -> test -> retry-until-green -> merge -> receipt -> Slack

## Three decisions (the confidence gate)
- High confidence + real violation -> fix in sandbox, test, merge.
- Confident it's fine (e.g. a fake test card in a test file) -> allow, log why.
- Unsure / risky -> escalate to a human. Do NOT merge on low confidence.
Rule of thumb: a wrong fix that merges is worse than an escalation. When in doubt, escalate.

## Honesty rules (READ THIS)
This product lives or dies on trust, so do not bluff.
- If you don't know something, say so. Never invent API names, endpoints, flags, env vars, file paths, or behavior.
- The sponsor SDKs below are not reliably in your training data. Before writing ANY integration code, fetch the official docs (WebFetch the URL in docs/sponsors.md) or ask. Guessing a method signature is a bug, not a shortcut.
- Mark every assumption in code as // ASSUMPTION: ... so a human can verify it.
- When choosing between approaches, say which you picked, why, and your confidence — don't silently decide and present it as fact.
- "I need to check X" beats a confident wrong answer. Stop and ask.
- If a test, command, or value isn't in the repo or docs, don't assume it exists — verify or ask.
- Hard guarantees belong in a hook or a test, not in this file. Treat everything here as guidance, not an enforced wall.

## Sponsors / integrations (fetch docs before coding — see docs/sponsors.md)
Building with (the core loop):
- Daytona — the isolated sandbox where the agent rewrites the rule-breaking code and runs the tests; the heart of the demo.
- Kalibr — orchestrates the trigger->fix->test chain and recovers when a fix fails a test (the retry loop).
- Insforge — agent-native backend: the database, auth, and the event that wakes the agent when a PR opens.
- Tigris — S3-compatible storage for the audit trail: every receipt, diff, and log.
- Render — hosts the live screen + backend so judges hit a real public URL.

Bonus (pitch-only unless the core loop is fully done and polished):
- Opsera, NEAR AI, Brain2, Apify, Rtrvr.ai, Nebius, Lightsprint.ai.

## Stack
GitHub API (Octokit) for webhook/branch/commit/merge - Claude (Sonnet) as the brain that decides + writes the fix (Anthropic API) - Daytona sandboxes - Kalibr orchestration - Insforge state/auth - Tigris storage - Slack API for the ping - Next.js (or plain web) frontend on Render.

## Scope — build vs pitch
BUILD: the full loop - the 3 branches (fix / allow / escalate) - the 2 planted PRs - the receipt - the Slack ping - the live screen - the manual backup button.
PITCH ONLY — do NOT build: CVE trigger - multi-repo - the real learning/memory system - Jira tickets. If asked, say "that's where it's going," don't implement it.

## The two planted PRs (the demo's whole argument) — detail in docs/rules.md
- Real violation: a card number written to logs in app code -> agent must catch + fix.
- Decoy: a fake/test card used as test data in a test file -> agent must ALLOW it. Catching the decoy = failing the demo. Context beats keyword-matching.

## How we work (hackathon mode)
- Everyone builds against fake inputs first so nobody waits. Agree how your parts connect when you get there.
- Small commits. Run tests before you merge. Keep a receipt of what changed.
- Don't gold-plate. Ship the loop end-to-end first, then make ONE step impressive (the self-correction).
- Start every session with /prime. When you're blocked, run /stuck instead of guessing.

## Owners
- Aryan — Fix engine + storage (tech lead). Daytona sandbox, rewriting rule-breaking code, running tests and retrying until green, saving data to Tigris + Insforge, and writing the short "why" per fix. Steps in when connections break.
- Shreyash — Trigger + decision (the brain). The demo repo, the rules, the webhook that wakes the agent; then the judgment (real / false alarm / unclear) and the confidence level that decides fix vs allow vs escalate.
- Kaushik — Merge + receipt + notifications. Merge the tested fix via GitHub API, post the receipt comment, send the Slack ping. Clear inputs and outputs.
- Nandan — Live screen + deploy. The real-time feed of each step, visual polish, the manual backup button, and deploying to Render.

## Commands (UPDATE these as the repo takes shape)
- Install: npm install
- Dev: npm run dev
- Test: npm test
(If these are wrong, fix this section — an out-of-date command costs everyone time.)

## Detail lives elsewhere (read on demand — NOT auto-loaded)
- docs/sponsors.md — sponsor doc URLs + API surface (read before ANY integration).
- docs/rules.md — the hardcoded rules + the 2 planted PRs.
- docs/demo.md — the demo script + timings.
Keep THIS file short. Read a doc when you need it.

## Health Stack

- typecheck: tsc --noEmit
- lint: biome check .
- test: node --test test/*.test.js
