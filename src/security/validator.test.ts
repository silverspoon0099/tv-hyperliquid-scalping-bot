import {
  validateAlert,
  checkRateLimit,
  validateOrderSize,
  validateLeverage,
} from './validator.js';

describe('Validator', () => {
  describe('validateAlert', () => {
    it('should validate correct alert format', () => {
      const alert = {
        action: 'long',
        ticker: 'BTCUSDC.P',
        price: 64231.5,
        time: 1719871200000,
      };

      const result = validateAlert(alert);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('long');
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

    it('should reject missing required fields', () => {
      const alert = {
        action: 'long',
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
