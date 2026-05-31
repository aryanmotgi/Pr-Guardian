// Minimal HTTP server — not required for tests, used for local dev / demo screen
// ASSUMPTION: no express dependency; uses Node built-in http to keep install fast
const http = require('http');
const { checkout } = require('./checkout');
const logger = require('./logger');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/checkout') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { cart, payment } = JSON.parse(body);
        const result = checkout(cart, payment);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'acme-payments' }));
  }
});

server.listen(PORT, () => logger.info('Server started', { port: PORT }));

module.exports = server; // exported so tests can close it
