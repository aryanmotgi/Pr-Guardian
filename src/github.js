// GitHub side of the merge stage: post the receipt comment and merge the PR.
//
// HONESTY NOTE (per CLAUDE.md): the Octokit method shapes below are the
// standard @octokit/rest REST endpoints. Before relying on them in the live
// demo, confirm against https://octokit.github.io/rest.js/ — these are marked
// // ASSUMPTION where the exact param names matter.

import { Octokit } from "@octokit/rest";
import { config, canCallGithub } from "./config.js";

let _octokit = null;
function octokit() {
  if (!_octokit) _octokit = new Octokit({ auth: config.github.token });
  return _octokit;
}

// Test seam: inject a (possibly fake) Octokit client. Pass null to reset and
// fall back to the lazily-created real client. Not used in production.
export function _setOctokit(client) {
  _octokit = client;
}

// Post the receipt as a comment on the PR.
// repo: { owner, name }, pr: { number }
export async function postReceipt({ repo, pr }, body) {
  if (config.dryRun || !canCallGithub()) {
    log("postReceipt", repo, pr);
    console.log(indent(body));
    return { dryRun: true };
  }
  // ASSUMPTION: issues.createComment works on PRs (PRs are issues in the API).
  const res = await octokit().issues.createComment({
    owner: repo.owner,
    repo: repo.name,
    issue_number: pr.number,
    body,
  });
  return { url: res.data.html_url };
}

// Merge the PR. Only call this when the decision is "fix" AND tests passed —
// the caller (index.js) enforces that gate.
// repo: { owner, name }, pr: { number, title }
export async function mergePR({ repo, pr }) {
  if (config.dryRun || !canCallGithub()) {
    log("mergePR", repo, pr);
    console.log(`   would merge via "${config.github.mergeMethod}"`);
    return { merged: true, dryRun: true };
  }
  // ASSUMPTION: pulls.merge param names (pull_number, merge_method).
  const res = await octokit().pulls.merge({
    owner: repo.owner,
    repo: repo.name,
    pull_number: pr.number,
    merge_method: config.github.mergeMethod,
    commit_title: `PR Guardian: ${pr.title || `merge #${pr.number}`}`,
  });
  return { merged: res.data.merged, sha: res.data.sha };
}

function log(fn, repo, pr) {
  console.log(`🐙 [dry-run] github.${fn} → ${repo.owner}/${repo.name}#${pr.number}`);
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "   │ " + l)
    .join("\n");
}
