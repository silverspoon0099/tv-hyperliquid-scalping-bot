import logger from '../utils/logger.js';
import { Position, OrderResult } from '../types/alert.js';

export class HyperliquidMockClient {
  private positions = new Map<string, Position>();
  private orderHistory: OrderResult[] = [];

  async validateApiKeys(): Promise<boolean> {
    logger.info('Mock: API credentials validated');
    return true;
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const position = this.positions.get(symbol);
    if (!position) {
      return {
        symbol,
        side: null,
        size: 0,
        entryPrice: 0,
        leverage: 1,
        unrealizedPnl: 0,
        liquidationPrice: 0,
      };
    }
    logger.debug({ symbol, position }, 'Mock: Position fetched');
    return position;
  }

  async placeMarketOrder(
    symbol: string,
    side: 'long' | 'short',
    size: number
  ): Promise<OrderResult | null> {
    const order: OrderResult = {
      orderId: `mock-${Date.now()}`,
      symbol,
      side,
      size,
      executedPrice: 50000 + Math.random() * 1000,
      timestamp: Date.now(),
      status: 'filled',
    };

    this.orderHistory.push(order);
    logger.info({ order }, 'Mock: Order placed');
    return order;
  }

  async closePosition(symbol: string): Promise<OrderResult | null> {
    const position = await this.getPosition(symbol);
    if (!position || position.size === 0) {
      logger.debug({ symbol }, 'Mock: No position to close');
      return null;
    }

    const closeSide = position.side === 'long' ? 'short' : 'long';
    return await this.placeMarketOrder(symbol, closeSide, position.size);
  }

  async flipPosition(
    symbol: string,
    newSide: 'long' | 'short',
    size: number
  ): Promise<{ closed?: OrderResult; opened: OrderResult } | null> {
    const currentPosition = await this.getPosition(symbol);

    const closeResult =
      currentPosition && currentPosition.side && currentPosition.side !== newSide
        ? await this.closePosition(symbol)
        : null;

    const openResult = await this.placeMarketOrder(symbol, newSide, size);

    if (!openResult) {
      throw new Error('Failed to open new position');
    }

    return {
      closed: closeResult || undefined,
      opened: openResult,
    };
  }

  getOrderHistory(): OrderResult[] {
    return [...this.orderHistory];
  }

  reset(): void {
    this.positions.clear();
    this.orderHistory = [];
    logger.info('Mock: State reset');
  }
}

export const hlMockClient = new HyperliquidMockClient();
