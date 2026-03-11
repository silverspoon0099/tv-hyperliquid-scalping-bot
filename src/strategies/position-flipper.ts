import { TradingViewAlert, PositionFlipResult } from '../types/alert.js';
import { hlClient } from '../exchange/hyperliquid.js';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { normalizeSymbol } from '../utils/symbol.js';

export async function handlePositionFlip(
  alert: TradingViewAlert
): Promise<PositionFlipResult | null> {
  const startTime = Date.now();

  try {
    // Normalize the symbol for Hyperliquid API compatibility
    const symbol = normalizeSymbol(alert.ticker);

    // Determine position size: use alert qty, then check default map, then fallback
    let positionSize = alert.qty;
    if (!positionSize) {
      positionSize =
        config.trading.defaultQtyMap[symbol] ||
        config.trading.defaultQtyMap[alert.ticker] ||
        0.1;
      logger.debug(
        { symbol, positionSize, source: 'default-qty-map' },
        'Using default position size from config'
      );
    }

    logger.info(
      { symbol, action: alert.action, price: alert.price, qty: positionSize },
      'Processing position flip signal'
    );

    const result = await hlClient.flipPosition(
      symbol,
      alert.action,
      positionSize
    );

    if (!result) {
      throw new Error('Position flip returned null');
    }

    const totalLatency = Date.now() - startTime;

    logger.info(
      {
        symbol,
        oldSide: result.closed?.side,
        newSide: result.opened.side,
        totalLatencyMs: totalLatency,
      },
      'Position flip completed'
    );

    return {
      closed: result.closed,
      opened: result.opened,
      totalLatencyMs: totalLatency,
    };
  } catch (error) {
    logger.error(
      { error, alert },
      'Position flip failed'
    );
    return null;
  }
}
