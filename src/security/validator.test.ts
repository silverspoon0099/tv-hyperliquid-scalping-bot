// Set env vars before importing config
process.env.ENV = process.env.ENV || 'testnet';
process.env.LONG_WALLET_TESTNET_PRIVATE_KEY = process.env.LONG_WALLET_TESTNET_PRIVATE_KEY || '0x' + '1'.repeat(64);
process.env.SHORT_WALLET_TESTNET_PRIVATE_KEY = process.env.SHORT_WALLET_TESTNET_PRIVATE_KEY || '0x' + '2'.repeat(64);
process.env.MAX_POSITION_SIZE = process.env.MAX_POSITION_SIZE || '10';
process.env.MAX_LEVERAGE = process.env.MAX_LEVERAGE || '5';
process.env.MIN_ORDER_SIZE = process.env.MIN_ORDER_SIZE || '0.01';

import {
  validateAlert,
  checkRateLimit,
  validateOrderSize,
  validateLeverage,
} from './validator.js';

describe('Validator', () => {
  describe('validateAlert', () => {
    it('should validate open long alert', () => {
      const alert = {
        action: 'open',
        side: 'long',
        ticker: 'BTCUSDC.P',
        price: 64231.5,
        time: 1719871200000,
      };

      const result = validateAlert(alert);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('open');
      if (result && 'side' in result) {
        expect(result.side).toBe('long');
      }
    });

    it('should validate open short alert', () => {
      const alert = {
        action: 'open',
        side: 'short',
        ticker: 'ETHUSDC.P',
        price: 3500,
      };

      const result = validateAlert(alert);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('open');
      if (result && 'side' in result) {
        expect(result.side).toBe('short');
      }
    });

    it('should validate close alert', () => {
      const alert = {
        action: 'close',
        side: 'long',
        reason: 'flip',
        ticker: 'TAOUSDT',
        price: 305.8,
        time: 1774990800000,
      };

      const result = validateAlert(alert);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('close');
      if (result && 'side' in result) {
        expect(result.side).toBe('long');
      }
    });

    it('should reject invalid action', () => {
      const alert = {
        action: 'invalid',
        ticker: 'BTCUSDC.P',
        price: 64231.5,
        time: 1719871200000,
      };

      const result = validateAlert(alert);
      expect(result).toBeNull();
    });

    it('should reject close alert without side', () => {
      const alert = {
        action: 'close',
        ticker: 'BTCUSDC.P',
        price: 64231.5,
      };

      const result = validateAlert(alert);
      expect(result).toBeNull();
    });

    it('should reject missing required fields', () => {
      const alert = {
        action: 'open',
      };

      const result = validateAlert(alert);
      expect(result).toBeNull();
    });
  });

  describe('validateOrderSize', () => {
    it('should accept valid order size', () => {
      expect(validateOrderSize(1)).toBe(true);
      expect(validateOrderSize(5)).toBe(true);
    });

    it('should reject order size below minimum', () => {
      expect(validateOrderSize(0.001)).toBe(false);
    });

    it('should reject order size above maximum', () => {
      expect(validateOrderSize(100)).toBe(false);
    });
  });

  describe('validateLeverage', () => {
    it('should accept valid leverage', () => {
      expect(validateLeverage(1)).toBe(true);
      expect(validateLeverage(5)).toBe(true);
    });

    it('should reject leverage above maximum', () => {
      expect(validateLeverage(10)).toBe(false);
    });

    it('should reject leverage below 1', () => {
      expect(validateLeverage(0.5)).toBe(false);
    });
  });
});
