// Mocked test for closeLoop on the team contract closeLoop({ pr, result }).
// Captures GitHub (merge + comment) and Slack payloads via a real Octokit
// (injected fetch) + the Slack _setFetch seam. No network, no creds.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Octokit } from "@octokit/rest";

process.env.DRY_RUN = "false";
process.env.GITHUB_TOKEN = "test-token";
process.env.SLACK_WEBHOOK_URL =
	"https://hooks.slack.com/services/T000/B000/fake";
process.env.SLACK_ESCALATION_MENTION = "<@U_ONCALL>";

const { closeLoop } = await import("../src/close-loop.js");
const { _setOctokit } = await import("../src/github.js");
const { _setFetch } = await import("../src/slack.js");

function install() {
	const gh = [];
	const slack = [];
	_setOctokit(
		new Octokit({
			auth: "test-token",
			request: {
				fetch: async (url, opts = {}) => {
					gh.push({
						url,
						method: opts.method,
						body: opts.body ? JSON.parse(opts.body) : null,
					});
					let data = {};
					let status = 200;
					if (/\/pulls\/\d+\/merge$/.test(url)) {
						data = { merged: true, sha: "abc123" };
					} else if (/\/issues\/\d+\/comments$/.test(url)) {
						data = {
							html_url:
								"https://github.com/ssmoney1/acme-payments/pull/1#issuecomment-9",
						};
						status = 201;
					}
					return new Response(JSON.stringify(data), {
						status,
						headers: { "content-type": "application/json" },
					});
				},
			},
		}),
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

test("FIX contract: merges, posts a receipt with before/after diff + 'fixed in Xs', green Slack card", async () => {
	const { gh, slack } = install();
	const out = await closeLoop({
		pr: prBase,
		result: {
			escalate: false, // outcome inferred → fix
			time_ms: 8200,
			tests: { passed: 6, total: 6 },
			before: 'console.log("Charging card " + card.number);',
			after: 'console.log("Charging card ****" + card.number.slice(-4));',
		},
	});

	console.log(
		"\n[fix] result:",
		JSON.stringify(out, (k, v) => (k === "slack" ? "…" : v)),
	);

	// merge happened, in order before the receipt
	assert.equal(mergeCalls(gh).length, 1);
	assert.match(gh[0].url, /\/pulls\/1\/merge$/);
	// receipt carries the synthesised before/after diff and the time line
	const body = comment(gh).body.body;
	assert.match(body, /```diff/);
	assert.match(body, /card\.number\.slice\(-4\)/);
	assert.match(body, /Fixed in 8\.2s/);
	// green merged Slack card
	assert.match(slack[0].body.text, /Auto-fixed & merged/);
	assert.equal(out.outcome, "fix");
	assert.equal(out.merged, true);
	assert.equal(out.mergeSha, "abc123");
});

test("ALLOW contract: quiet receipt, NO merge, no @-mention", async () => {
	const { gh, slack } = install();
	const out = await closeLoop({
		pr: { ...prBase, number: 2 },
		result: { outcome: "allow", time_ms: 1500, tests: { passed: 6, total: 6 } },
	});

	assert.equal(mergeCalls(gh).length, 0, "allow must not merge");
	assert.ok(comment(gh), "still posts a receipt");
	assert.match(comment(gh).body.body, /compliant, no action needed/i);
	assert.doesNotMatch(slack[0].body.text, /<!|<@/, "no @-mention / no alert");
	assert.equal(out.outcome, "allow");
	assert.equal(out.merged, false);
});

test("ESCALATE contract (escalate:true): red alert + @human + severity, NO merge", async () => {
	const { gh, slack } = install();
	const out = await closeLoop({
		pr: {
			...prBase,
			number: 3,
			violation: {
				...prBase.violation,
				reason: "Possible hardcoded secret / API key",
			},
		},
		result: { escalate: true, time_ms: 12000 }, // no tests
	});

	assert.equal(mergeCalls(gh).length, 0, "escalate must not merge");
	assert.match(comment(gh).body.body, /needs human review/i);
	const msg = slack[0].body;
	assert.match(msg.text, /<@U_ONCALL>/, "@-mentions a human");
	assert.match(msg.text, /🔴 HIGH|🟠 MEDIUM/, "has a severity badge");
	assert.equal(
		msg.blocks.find((b) => b.type === "actions").elements[0].style,
		"danger",
	);
	assert.equal(out.outcome, "escalate");
	assert.equal(out.merged, false);
});

test("GATE: a 'fix' with missing tests does NOT merge — downgraded to escalate (fail safe)", async () => {
	const { gh } = install();
	const out = await closeLoop({
		pr: { ...prBase, number: 4 },
		result: { outcome: "fix", before: "a", after: "b" }, // no tests
	});

	assert.equal(mergeCalls(gh).length, 0, "no merge without green tests");
	assert.equal(out.outcome, "escalate");
	assert.equal(out.merged, false);
	assert.equal(out.downgradedFrom, "fix");
});

test("GATE: a 'fix' with non-green tests does NOT merge — downgraded to escalate", async () => {
	const { gh } = install();
	const out = await closeLoop({
		pr: { ...prBase, number: 5 },
		result: { outcome: "fix", tests: { passed: 5, total: 6 } },
	});

	assert.equal(mergeCalls(gh).length, 0);
	assert.equal(out.outcome, "escalate");
});

test("DEFENSIVE: missing pr identity throws a clear error; partial result never crashes", async () => {
	install();
	await assert.rejects(
		() => closeLoop({ pr: { owner: "x" }, result: {} }),
		/owner.*repo.*number/,
	);

	// a near-empty result must not crash — infers escalate, makes zero merges
	const { gh } = install();
	const out = await closeLoop({ pr: { ...prBase, number: 6 }, result: {} });
	assert.equal(mergeCalls(gh).length, 0);
	assert.equal(out.outcome, "escalate");
});

test("BACK-COMPAT: the old flat signature still merges a green fix", async () => {
	const { gh } = install();
	const out = await closeLoop({
		owner: "ssmoney1",
		repo: "acme-payments",
		prNumber: 7,
		whyText: "Logged the PAN.",
		changeSummary: "Masked it.",
		tests: { passed: 3, total: 3 },
	});

	assert.equal(mergeCalls(gh).length, 1, "flat fix still merges");
	assert.equal(out.outcome, "fix");
	assert.equal(out.merged, true);
});
