const { processPayment } = require('../src/payment');

// Standard Stripe test cards — safe to commit, these are published fixture values
// See: https://stripe.com/docs/testing#cards
const STRIPE_TEST_CARDS = {
  visa:        '4242424242424242', // standard Visa test card
  mastercard:  '5555555555554444',
};

describe('refund flow', () => {
  test('processes a payment that can later be refunded', () => {
    const result = processPayment({
      cardNumber: STRIPE_TEST_CARDS.visa,
      amount: 19.99,
      currency: 'USD',
    });
    expect(result.success).toBe(true);
    expect(result.transactionId).toMatch(/^txn_/);
  });

  test('handles mastercard test card', () => {
    const result = processPayment({
      cardNumber: STRIPE_TEST_CARDS.mastercard,
      amount: 5.0,
      currency: 'USD',
    });
    expect(result.success).toBe(true);
  });
});
