const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function fetchDiff({ owner, repo, number, title }) {
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: number,
  });

  return {
    prNumber: number,
    title,
    files: files.map(f => ({
      filename: f.filename,
      patch: f.patch || '',
    })),
  };
}

module.exports = { fetchDiff };
