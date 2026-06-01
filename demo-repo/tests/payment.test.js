const { processPayment, maskPan } = require('../src/payment');

describe('maskPan', () => {
  test('masks all but last 4 digits', () => {
    expect(maskPan('4111111111111111')).toBe('************1111');
  });

  test('handles card with spaces', () => {
    expect(maskPan('4111 1111 1111 1111')).toBe('**** **** **** 1111');
  });
});

describe('processPayment', () => {
  test('returns success for valid payment', () => {
    const result = processPayment({ cardNumber: '5555555555554444', amount: 99.99 });
    expect(result.success).toBe(true);
    expect(result.transactionId).toMatch(/^txn_/);
    expect(result.amount).toBe(99.99);
    expect(result.currency).toBe('USD');
  });

  test('respects explicit currency', () => {
    const result = processPayment({ cardNumber: '5555555555554444', amount: 50, currency: 'CAD' });
    expect(result.currency).toBe('CAD');
  });

  test('throws on card too short', () => {
    expect(() => processPayment({ cardNumber: '123', amount: 10 })).toThrow('Invalid card number');
  });

  test('throws on missing card', () => {
    expect(() => processPayment({ amount: 10 })).toThrow('Invalid card number');
  });

  test('throws on zero amount', () => {
    expect(() => processPayment({ cardNumber: '5555555555554444', amount: 0 })).toThrow('Invalid amount');
  });

  test('throws on negative amount', () => {
    expect(() => processPayment({ cardNumber: '5555555555554444', amount: -5 })).toThrow('Invalid amount');
  });

  test('never logs the full PAN', () => {
    const pan = '4111111111111111';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      processPayment({ cardNumber: pan, amount: 50 });
      const output = logSpy.mock.calls.flat().map(String).join(' ');
      expect(output).not.toContain(pan);
    } finally {
      logSpy.mockRestore();
    }
  });
});
