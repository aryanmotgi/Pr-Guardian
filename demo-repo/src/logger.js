// Structured logger — always mask PII before passing to log methods
const logger = {
  info:  (msg, data = {}) => console.log(JSON.stringify({ level: 'info',  msg, ...data, ts: new Date().toISOString() })),
  warn:  (msg, data = {}) => console.warn(JSON.stringify({ level: 'warn',  msg, ...data, ts: new Date().toISOString() })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', msg, ...data, ts: new Date().toISOString() })),
  debug: (msg, data = {}) => console.log(JSON.stringify({ level: 'debug', msg, ...data, ts: new Date().toISOString() })),
};

module.exports = logger;
