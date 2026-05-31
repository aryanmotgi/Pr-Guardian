// Mocked end-to-end test for the merge stage.
//
// Proves our code calls the CORRECT GitHub endpoints with the CORRECT params by
// driving a REAL Octokit client whose HTTP layer is an injected fake `fetch`
// that records every request. No network, no real merge, no creds needed.
//
// What this proves: pulls.merge → PUT .../pulls/{n}/merge with the right body,
// issues.createComment → POST .../issues/{n}/comments, and the decision gate
// (merge only on `fix` + passing tests).
// What it does NOT prove: that GitHub accepts the request (auth / permissions /
// mergeability) — that needs one live run against a real repo+PR.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Octokit } from "@octokit/rest";

// Force the live code path. config.js reads env via getters, so these take
// effect by the time runMergeStage runs (even though ESM hoists the imports).
// Slack is left without creds, so it stays in dry-run (no network) on its own.
process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";
delete process.env.SLACK_BOT_TOKEN;
delete process.env.SLACK_CHANNEL;

const { runMergeStage } = await import("../src/index.js");
const { _setOctokit } = await import("../src/github.js");
const { fixtures } = await import("../src/fixtures.js");

// Builds an Octokit whose requests are intercepted and recorded.
function installRecorder() {
	const calls = [];
	const fetch = async (url, opts = {}) => {
		let body = null;
		if (opts.body) {
			try {
				body = JSON.parse(opts.body);
			} catch {
				body = opts.body;
			}
		}
		calls.push({ method: opts.method, url, body });

		let data = {};
		let status = 200;
		if (/\/pulls\/\d+\/merge$/.test(url)) {
			data = {
				merged: true,
				sha: "abc123",
				message: "Pull Request successfully merged",
			};
		} else if (/\/issues\/\d+\/comments$/.test(url)) {
			data = {
				id: 1,
				html_url:
					"https://github.com/acme/acme-payments/pull/42#issuecomment-1",
			};
			status = 201;
		}
		return new Response(JSON.stringify(data), {
			status,
			headers: { "content-type": "application/json" },
		});
	};

	_setOctokit(new Octokit({ auth: "test-token", request: { fetch } }));
	return calls;
}

const mergeCall = (calls) =>
	calls.find((c) => /\/pulls\/\d+\/merge$/.test(c.url));
const commentCall = (calls) =>
	calls.find((c) => /\/issues\/\d+\/comments$/.test(c.url));

test("fix → merges the PR and posts a receipt with correct GitHub API calls", async () => {
	const calls = installRecorder();
	const outcome = await runMergeStage(fixtures.fix);

	console.log("\n[fix] returned:", JSON.stringify(outcome, null, 2));
	console.log(
		"[fix] github calls:",
		calls.map((c) => `${c.method} ${c.url}`),
	);

	const merge = mergeCall(calls);
	assert.ok(merge, "expected a merge request");
	assert.equal(merge.method, "PUT");
	assert.match(merge.url, /\/repos\/acme\/acme-payments\/pulls\/42\/merge$/);
	assert.equal(merge.body.merge_method, "squash");
	assert.match(merge.body.commit_title, /PR Guardian/);

	const comment = commentCall(calls);
	assert.ok(comment, "expected a receipt comment");
	assert.equal(comment.method, "POST");
	assert.match(
		comment.url,
		/\/repos\/acme\/acme-payments\/issues\/42\/comments$/,
	);
	assert.match(comment.body.body, /fixed & merged/);
	assert.match(comment.body.body, /\*\*\*\*/); // masked-card diff made it into the receipt

	assert.equal(outcome.decision, "fix");
	assert.equal(outcome.merged, true);
});

test("allow → posts a receipt but does NOT merge", async () => {
	const calls = installRecorder();
	const outcome = await runMergeStage(fixtures.allow);

	console.log("\n[allow] returned:", JSON.stringify(outcome, null, 2));

	assert.equal(mergeCall(calls), undefined, "must not merge on allow");
	assert.ok(commentCall(calls), "should still post a receipt");
	assert.equal(outcome.merged, false);
});

test("escalate → posts a receipt but does NOT merge", async () => {
	const calls = installRecorder();
	const outcome = await runMergeStage(fixtures.escalate);

	console.log("\n[escalate] returned:", JSON.stringify(outcome, null, 2));

	assert.equal(mergeCall(calls), undefined, "must not merge on escalate");
	assert.ok(commentCall(calls), "should still post a receipt");
	assert.equal(outcome.merged, false);
});

test("safety gate → refuses to merge a fix whose tests did not pass", async () => {
	installRecorder();
	const bad = {
		...fixtures.fix,
		sandbox: { ...fixtures.fix.sandbox, testsPassed: false },
	};
	await assert.rejects(() => runMergeStage(bad), /Refusing to merge/);
});
