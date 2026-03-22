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

    // Determine stop loss: use alert stop_loss, then check default map, then fallback to 1.5%
    let stopLoss = alert.stop_loss;
    if (!stopLoss) {
      stopLoss =
        config.trading.defaultStopLossMap[symbol] ||
        config.trading.defaultStopLossMap[alert.ticker] ||
        1.5;
      logger.debug(
        { symbol, stopLoss, source: 'default-stop-loss-map' },
        'Using default stop loss from config'
      );
    }

    logger.info(
      { symbol, action: alert.action, price: alert.price, qty: positionSize, stopLoss },
      'Processing position flip signal'
    );

    const result = await hlClient.flipPosition(
      symbol,
      alert.action,
      positionSize,
      stopLoss
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
