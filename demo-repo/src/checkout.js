const { processPayment } = require('./payment');
const logger = require('./logger');

function checkout(cart, paymentDetails) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new Error('Cart is empty');
  }

  const total = cart.reduce((sum, item) => {
    if (typeof item.price !== 'number' || item.price <= 0) {
      throw new Error(`Invalid price for item: ${item.name}`);
    }
    return sum + item.price;
  }, 0);

  if (total <= 0) {
    throw new Error('Invalid cart total');
  }

  logger.info('Checkout initiated', { itemCount: cart.length, total });

  return processPayment({
    cardNumber: paymentDetails.cardNumber,
    amount: Math.round(total * 100) / 100, // round to cents
    currency: paymentDetails.currency || 'USD',
  });
}

module.exports = { checkout };
