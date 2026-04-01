import logger from '../utils/logger.js';
import { Position, OrderResult } from '../types/alert.js';

export class HyperliquidMockClient {
  private label: string;
  private positions = new Map<string, Position>();
  private orderHistory: OrderResult[] = [];

  constructor(label: string = 'mock') {
    this.label = label;
  }

  async validateApiKeys(): Promise<boolean> {
    logger.info({ label: this.label }, 'Mock: API credentials validated');
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
    logger.debug({ symbol, position, label: this.label }, 'Mock: Position fetched');
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

    // Track position
    this.positions.set(symbol, {
      symbol,
      side,
      size,
      entryPrice: order.executedPrice,
      leverage: 1,
      unrealizedPnl: 0,
      liquidationPrice: 0,
    });

    this.orderHistory.push(order);
    logger.info({ order, label: this.label }, 'Mock: Order placed');
    return order;
  }

  async placeStopLoss(
    symbol: string,
    entryPrice: number,
    side: 'long' | 'short',
    positionSize: number,
    slPercentage: number = 1.5
  ): Promise<boolean> {
    logger.info(
      { symbol, entryPrice, side, positionSize, slPercentage, label: this.label },
      'Mock: Stop loss placed'
    );
    return true;
  }

  async closePosition(symbol: string): Promise<OrderResult | null> {
    const position = await this.getPosition(symbol);
    if (!position || position.size === 0) {
      logger.debug({ symbol, label: this.label }, 'Mock: No position to close');
      return null;
    }

    const closeSide = position.side === 'long' ? 'short' : 'long';
    const result = await this.placeMarketOrder(symbol, closeSide, position.size);

    // Clear the position after closing
    this.positions.delete(symbol);

    return result;
  }

  async openPosition(
    symbol: string,
    side: 'long' | 'short',
    size: number,
    stopLossPercent: number = 1.5
  ): Promise<{ opened: OrderResult; slPlaced: boolean } | null> {
    const openResult = await this.placeMarketOrder(symbol, side, size);

    if (!openResult) {
      throw new Error('Failed to open new position');
    }

    const slPlaced = await this.placeStopLoss(symbol, openResult.executedPrice, side, size, stopLossPercent);

    return { opened: openResult, slPlaced };
  }

  getLabel(): string {
    return this.label;
  }

  getAddress(): string {
    return `0xMOCK_${this.label.toUpperCase()}`;
  }

  getOrderHistory(): OrderResult[] {
    return [...this.orderHistory];
  }

  reset(): void {
    this.positions.clear();
    this.orderHistory = [];
    logger.info({ label: this.label }, 'Mock: State reset');
  }
}

// Two mock wallet instances matching the real setup
export const hlMockLongClient = new HyperliquidMockClient('long-wallet');
export const hlMockShortClient = new HyperliquidMockClient('short-wallet');
