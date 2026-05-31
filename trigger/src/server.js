const express = require('express');
const crypto = require('crypto');

const app = express();

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

function verifySignature(req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Real webhook from GitHub
app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('Invalid webhook signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  if (event !== 'pull_request') {
    return res.status(200).json({ ignored: true, event });
  }

  const { action, pull_request, repository } = req.body;
  if (action !== 'opened' && action !== 'synchronize') {
    return res.status(200).json({ ignored: true, action });
  }

  const pr = {
    number: pull_request.number,
    title: pull_request.title,
    owner: repository.owner.login,
    repo: repository.name,
  };

  console.log(`PR #${pr.number} "${pr.title}" received — processing...`);
  res.status(202).json({ received: true, pr: pr.number });

  // Fire and forget — process async so GitHub doesn't time out waiting
  processPR(pr).catch(err => console.error('Pipeline error:', err));
});

// Manual backup button — fire the loop without a real webhook
app.post('/trigger', (req, res) => {
  const { owner, repo, prNumber } = req.body;
  if (!owner || !repo || !prNumber) {
    return res.status(400).json({ error: 'owner, repo, and prNumber are required' });
  }

  const pr = { owner, repo, number: prNumber, title: `Manual trigger for PR #${prNumber}` };
  console.log(`Manual trigger for PR #${pr.number}`);
  res.status(202).json({ received: true, pr: pr.number });

  processPR(pr).catch(err => console.error('Pipeline error:', err));
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function processPR(pr) {
  const { fetchDiff } = require('./diff');
  const { judge } = require('./judge');
  const { route } = require('./router');

  const diff = await fetchDiff(pr);
  const decision = await judge(diff);
  await route(pr, decision);
}

module.exports = { app };
