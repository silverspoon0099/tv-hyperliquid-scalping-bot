import { OpenAlert, CloseAlert, OpenResult, CloseResult } from '../types/alert.js';
import { getClientForSide } from '../exchange/hyperliquid.js';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { normalizeSymbol } from '../utils/symbol.js';

/**
 * Handle an "open" signal: open a position in the corresponding wallet (long-wallet or short-wallet).
 */
export async function handleOpen(alert: OpenAlert): Promise<OpenResult | null> {
  const startTime = Date.now();

  try {
    const symbol = normalizeSymbol(alert.ticker);
    const side = alert.side;
    const client = getClientForSide(side);

    // Determine position size
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

    // Determine stop loss
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

    // Skip if same-direction position already exists
    const existing = await client.getPosition(symbol);
    if (existing && existing.side === side && existing.size > 0) {
      logger.warn(
        { symbol, side, existingSize: existing.size, wallet: client.getLabel() },
        'Position already open in same direction — skipping'
      );
      return null;
    }

    logger.info(
      { symbol, side, price: alert.price, qty: positionSize, stopLoss, wallet: client.getLabel() },
      'Processing open signal'
    );

    const result = await client.openPosition(symbol, side, positionSize, stopLoss);

    if (!result) {
      throw new Error('Open position returned null');
    }

    const totalLatency = Date.now() - startTime;

    logger.info(
      {
        symbol,
        side,
        wallet: client.getLabel(),
        totalLatencyMs: totalLatency,
        slPlaced: result.slPlaced,
      },
      'Position opened'
    );

    return {
      opened: result.opened,
      slPlaced: result.slPlaced,
      totalLatencyMs: totalLatency,
    };
  } catch (error) {
    logger.error({ error, alert }, 'Open position failed');
    return null;
  }
}

/**
 * Handle a "close" signal: close the position in the wallet matching the side.
 */
export async function handleClose(alert: CloseAlert): Promise<CloseResult | null> {
  const startTime = Date.now();

  try {
    const symbol = normalizeSymbol(alert.ticker);
    const client = getClientForSide(alert.side);

    logger.info(
      { symbol, side: alert.side, reason: alert.reason, price: alert.price, wallet: client.getLabel() },
      'Processing close signal'
    );

    const closeResult = await client.closePosition(symbol);

    if (!closeResult) {
      logger.warn(
        { symbol, side: alert.side, wallet: client.getLabel() },
        'No position to close or close failed'
      );
      return null;
    }

    const totalLatency = Date.now() - startTime;

    logger.info(
      {
        symbol,
        side: alert.side,
        wallet: client.getLabel(),
        totalLatencyMs: totalLatency,
      },
      'Position closed'
    );

    return {
      closed: closeResult,
      totalLatencyMs: totalLatency,
    };
  } catch (error) {
    logger.error({ error, alert }, 'Close position failed');
    return null;
  }
}
