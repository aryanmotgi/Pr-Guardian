const { checkout } = require('../src/checkout');

// Standard Stripe test cards — safe to commit, these are published fixture values
// See: https://stripe.com/docs/testing#cards
const STRIPE_TEST_CARDS = {
  visa:       '4242424242424242', // standard Visa test card
  visaDecline: '4000000000000002', // always declines
  mastercard:  '5555555555554444',
};

describe('checkout', () => {
  const validCart = [
    { name: 'Widget Pro', price: 29.99 },
    { name: 'Gadget Plus', price: 49.99 },
  ];
  const validPayment = { cardNumber: STRIPE_TEST_CARDS.mastercard, currency: 'USD' };

  test('processes valid cart and returns success', () => {
    const result = checkout(validCart, validPayment);
    expect(result.success).toBe(true);
    expect(result.amount).toBe(79.98);
    expect(result.transactionId).toMatch(/^txn_/);
  });

  test('single item cart works', () => {
    const result = checkout([{ name: 'Solo Item', price: 9.99 }], validPayment);
    expect(result.success).toBe(true);
    expect(result.amount).toBe(9.99);
  });

  test('throws on empty cart', () => {
    expect(() => checkout([], validPayment)).toThrow('Cart is empty');
  });

  test('throws on null cart', () => {
    expect(() => checkout(null, validPayment)).toThrow('Cart is empty');
  });

  test('throws on item with invalid price', () => {
    const badCart = [{ name: 'Free?', price: -1 }];
    expect(() => checkout(badCart, validPayment)).toThrow('Invalid price');
  });

  test('processes standard Stripe Visa test card', () => {
    const result = checkout(
      [{ name: 'Test Item', price: 1.00 }],
      { cardNumber: STRIPE_TEST_CARDS.visa, currency: 'USD' }
    );
    expect(result.success).toBe(true);
  });
});
