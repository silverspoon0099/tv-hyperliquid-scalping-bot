import { TradingViewAlert, TradingViewAlertSchema } from '../types/alert.js';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';

const rateLimiter = new Map<string, number>();

export function validateAlert(data: unknown): TradingViewAlert | null {
  try {
    return TradingViewAlertSchema.parse(data);
  } catch (error) {
    logger.error({ error, data }, 'Alert validation failed');
    return null;
  }
}

export function checkRateLimit(key: string): boolean {
  const lastCall = rateLimiter.get(key) || 0;
  const elapsed = Date.now() - lastCall;
  const limitMs = config.trading.rateLimitMs;
  const remainingMs = Math.max(0, limitMs - elapsed);

  if (elapsed < limitMs) {
    logger.warn(
      {
        key,
        elapsedMs: elapsed,
        limitMs: limitMs,
        remainingMs: remainingMs,
        nextAllowedIn: `${(remainingMs / 1000).toFixed(1)}s`,
      },
      'Rate limit: Alert rejected (too soon)'
    );
    return false;
  }

  rateLimiter.set(key, Date.now());
  logger.debug({ key, limitMs }, 'Rate limit check passed');
  return true;
}

export function validateOrderSize(qty: number, symbol?: string): boolean {
  if (qty < config.trading.minOrderSize) {
    logger.error(
      { qty, min: config.trading.minOrderSize },
      'Order size below minimum'
    );
    return false;
  }

  let maxPositionSize = config.trading.maxPositionSize;
  if (symbol) {
    const tokenMaxSize = (config.trading.maxPositionSizeMap as Record<string, number>)[symbol];
    if (tokenMaxSize) {
      maxPositionSize = tokenMaxSize;
    }
  }

  if (qty > maxPositionSize) {
    logger.error(
      { qty, max: maxPositionSize, symbol },
      'Order size exceeds maximum'
    );
    return false;
  }

  return true;
}

export function validateLeverage(leverage: number): boolean {
  if (leverage > config.trading.maxLeverage) {
    logger.error(
      { leverage, max: config.trading.maxLeverage },
      'Leverage exceeds maximum'
    );
    return false;
  }

  if (leverage < 1) {
    logger.error('Leverage must be >= 1');
    return false;
  }

  return true;
}
