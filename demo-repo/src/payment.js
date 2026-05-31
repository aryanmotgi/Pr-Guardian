const logger = require('./logger');

function maskPan(pan) {
  // Show only last 4 digits — rule: never log full PAN
  // Strip spaces, mask, re-chunk to preserve formatted display (e.g. "4111 ..." -> "**** ... 1111")
  const stripped = String(pan).replace(/\s/g, '');
  const masked = stripped.replace(/\d(?=\d{4})/g, '*');
  return String(pan).includes(' ') ? masked.match(/.{1,4}/g).join(' ') : masked;
}

function processPayment({ cardNumber, amount, currency = 'USD' }) {
  if (!cardNumber || String(cardNumber).replace(/\s/g, '').length < 13) {
    throw new Error('Invalid card number');
  }
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }

  const pan = String(cardNumber).replace(/\s/g, '');

  // Log masked card only — never the full PAN
  logger.info('Processing payment', {
    last4: pan.slice(-4),
    amount,
    currency,
  });

  // ASSUMPTION: real gateway call would go here; we simulate success
  const transactionId = `txn_${Date.now()}_${pan.slice(-4)}`;

  logger.info('Payment authorized', { transactionId, amount, currency });

  return { success: true, transactionId, amount, currency };
}

module.exports = { processPayment, maskPan };
