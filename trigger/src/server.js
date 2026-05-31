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

// Friendly landing page so the URL shows something when opened in a browser
app.get('/', (_req, res) => {
  res.type('html').send(`
    <html>
      <head><title>PR Guardian — Trigger</title></head>
      <body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px;">
        <h1>🛡️ PR Guardian — Trigger & Decision</h1>
        <p>This service is <strong>live</strong>. It listens for GitHub pull requests, reads the diff, and judges each one against the security rules.</p>
        <ul>
          <li><code>POST /webhook</code> — GitHub PR events (signature-verified)</li>
          <li><code>POST /trigger</code> — manual backup trigger</li>
          <li><code>GET /health</code> — status check</li>
        </ul>
        <p style="color:#666;">Status: running ✅</p>
      </body>
    </html>
  `);
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
