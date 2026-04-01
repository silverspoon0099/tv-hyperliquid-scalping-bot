import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { Position, OrderResult } from '../types/alert.js';

type BookLevel = { px: string; sz: string };
type L2BookSnapshot = {
  levels: [BookLevel[], BookLevel[]];
  time?: number;
};

type TopOfBook = {
  bestBid: number;
  bestAsk: number;
  ts: number;
};

export class HyperliquidClient {
  private label: string;
  private exchangeClient: ExchangeClient;
  private infoClient: InfoClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private userAddress: string;
  private coinIndexCache = new Map<string, number>();
  private assetMetaCache = new Map<number, { szDecimals: number; name: string }>();
  private lastMetaFetch = 0;
  private metaCacheTTL = 24 * 60 * 60 * 1000; // 24 hours
  private bookCache = new Map<string, TopOfBook>();
  private inflightBookFetch = new Map<string, Promise<TopOfBook | null>>();

  constructor(privateKeyHex: `0x${string}`, label: string) {
    this.label = label;
    this.account = privateKeyToAccount(privateKeyHex);
    this.userAddress = this.account.address;

    const transport = new HttpTransport({
      isTestnet: config.env === 'testnet',
    });

    this.exchangeClient = new ExchangeClient({
      transport,
      wallet: this.account,
    });

    this.infoClient = new InfoClient({
      transport,
    });

    logger.info(
      {
        label: this.label,
        userAddress: this.userAddress,
        environment: config.env,
        apiUrl: config.apiUrl,
      },
      `Hyperliquid client initialized [${this.label}]`
    );

    // Pre-fetch asset metadata on startup for faster first order
    this.initializeAssetMetadata();
  }

  private async initializeAssetMetadata(): Promise<void> {
    try {
      logger.info({ label: this.label }, 'Pre-fetching asset metadata on startup...');
      const meta = await this.infoClient.meta();

      meta.universe.forEach((asset: any, index: number) => {
        this.assetMetaCache.set(index, {
          szDecimals: asset.szDecimals,
          name: asset.name,
        });
        this.coinIndexCache.set(asset.name.toUpperCase(), index);
      });

      this.lastMetaFetch = Date.now();
      logger.info(
        { label: this.label, cachedAssets: this.assetMetaCache.size, coinIndexes: this.coinIndexCache.size },
        'Asset metadata and coin indexes preloaded'
      );
    } catch (error) {
      logger.error({ error, label: this.label }, 'Failed to pre-fetch asset metadata');
    }
  }

  async validateApiKeys(): Promise<boolean> {
    try {
      const state = await this.infoClient.clearinghouseState({
        user: this.userAddress,
      });

      if (state?.crossMarginSummary) {
        logger.info({ label: this.label }, 'Hyperliquid API credentials validated');
        return true;
      }

      logger.error({ label: this.label }, 'Failed to validate API credentials');
      return false;
    } catch (error) {
      logger.error({ error, label: this.label }, 'API validation error');
      return false;
    }
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const state = await this.infoClient.clearinghouseState({
        user: this.userAddress,
      });

      if (!state?.assetPositions) {
        logger.debug({ symbol, label: this.label }, 'No asset positions found in state');
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

      const assetData = state.assetPositions.find(
        (pos) => pos.position.coin.toUpperCase() === symbol.toUpperCase()
      );

      if (!assetData?.position) {
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

      const positionSize = parseFloat(assetData.position.szi);
      const side: 'long' | 'short' | null =
        positionSize > 0 ? 'long' : positionSize < 0 ? 'short' : null;

      const position: Position = {
        symbol,
        side,
        size: Math.abs(positionSize),
        entryPrice: parseFloat(assetData.position.entryPx) || 0,
        leverage: assetData.position.leverage.value || 1,
        unrealizedPnl: parseFloat(assetData.position.unrealizedPnl) || 0,
        liquidationPrice: assetData.position.liquidationPx
          ? parseFloat(assetData.position.liquidationPx)
          : 0,
      };

      return position;
    } catch (error) {
      logger.error({ error, symbol, label: this.label }, 'Failed to fetch position');
      return null;
    }
  }

  private async getAssetMeta(coinIndex: number) {
    if (this.assetMetaCache.has(coinIndex)) {
      return this.assetMetaCache.get(coinIndex);
    }

    const now = Date.now();
    if (this.lastMetaFetch > 0 && now - this.lastMetaFetch < this.metaCacheTTL) {
      logger.debug({ coinIndex, label: this.label }, 'Asset meta not in cache, fetching...');
    }

    const meta = await this.infoClient.meta();
    const assetMeta = meta.universe[coinIndex];

    if (!assetMeta) {
      logger.error({ coinIndex, label: this.label }, 'Asset metadata not found');
      return null;
    }

    meta.universe.forEach((asset: any, index: number) => {
      this.assetMetaCache.set(index, {
        szDecimals: asset.szDecimals,
        name: asset.name,
      });
    });

    this.lastMetaFetch = now;
    logger.info(
      { label: this.label, cachedAssets: this.assetMetaCache.size },
      'Asset metadata cached (once per 24h)'
    );

    return this.assetMetaCache.get(coinIndex);
  }

  private async getCoinIndex(symbol: string): Promise<number | null> {
    const cached = this.coinIndexCache.get(symbol.toUpperCase());
    if (cached !== undefined) {
      return cached;
    }

    try {
      const meta = await this.infoClient.meta();
      const index = meta.universe.findIndex(
        (coin) => coin.name === symbol.toUpperCase()
      );

      if (index !== -1) {
        this.coinIndexCache.set(symbol.toUpperCase(), index);
        return index;
      }

      logger.warn({ symbol, label: this.label }, 'Coin not found in meta');
      return null;
    } catch (error) {
      logger.error({ error, symbol, label: this.label }, 'Failed to get coin index');
      return null;
    }
  }

  private formatHlPerpPrice(price: number, szDecimals: number): string {
    const maxDecimals = Math.max(0, 6 - szDecimals);

    if (Math.abs(price) >= 30000) {
      return Math.round(price).toString();
    }

    let p = Number(price.toFixed(maxDecimals));

    if (!Number.isInteger(p) && p !== 0) {
      const abs = Math.abs(p);
      const digitsBeforeDecimal = Math.floor(Math.log10(abs)) + 1;
      const allowedDecimalsBySigFigs = Math.max(0, 5 - digitsBeforeDecimal);
      const decimals = Math.min(maxDecimals, allowedDecimalsBySigFigs);
      p = Number(p.toFixed(decimals));
    }

    return p.toString();
  }

  private formatHlSize(size: number, szDecimals: number): string {
    return Number(size.toFixed(szDecimals)).toString();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getTopOfBook(symbol: string): Promise<TopOfBook | null> {
    const cached = this.bookCache.get(symbol.toUpperCase());
    const now = Date.now();

    if (cached && now - cached.ts < 300) {
      return cached;
    }

    const existing = this.inflightBookFetch.get(symbol.toUpperCase());
    if (existing) return existing;

    const p = (async () => {
      try {
        const book = (await this.infoClient.l2Book({
          coin: symbol.toUpperCase(),
        })) as L2BookSnapshot;

        const bids = book?.levels?.[0] ?? [];
        const asks = book?.levels?.[1] ?? [];

        if (!bids.length || !asks.length) {
          logger.warn({ symbol, label: this.label }, 'Empty L2 book');
          return null;
        }

        const bestBid = parseFloat(bids[0].px);
        const bestAsk = parseFloat(asks[0].px);

        if (
          !Number.isFinite(bestBid) ||
          !Number.isFinite(bestAsk) ||
          bestBid <= 0 ||
          bestAsk <= 0
        ) {
          logger.warn({ symbol, bestBid, bestAsk, label: this.label }, 'Invalid top of book');
          return null;
        }

        const top: TopOfBook = {
          bestBid,
          bestAsk,
          ts: Date.now(),
        };

        this.bookCache.set(symbol.toUpperCase(), top);
        return top;
      } catch (error) {
        logger.error({ error, symbol, label: this.label }, 'Failed to fetch L2 book');
        return null;
      } finally {
        this.inflightBookFetch.delete(symbol.toUpperCase());
      }
    })();

    this.inflightBookFetch.set(symbol.toUpperCase(), p);
    return p;
  }

  private getAggressiveIocPrice(
    side: 'long' | 'short',
    top: TopOfBook,
    slippageBps: number
  ): number {
    const slip = slippageBps / 10_000;

    if (side === 'long') {
      return top.bestAsk * (1 + slip);
    }

    return top.bestBid * (1 - slip);
  }

  private extractOrderStatus(orderResult: any) {
    return orderResult?.response?.data?.statuses?.[0] ?? null;
  }

  async placeMarketOrder(
    symbol: string,
    side: 'long' | 'short',
    size: number
  ): Promise<OrderResult | null> {
    return this.placeMarketOrderWithRetry(symbol, side, size);
  }

  private async placeMarketOrderWithRetry(
    symbol: string,
    side: 'long' | 'short',
    size: number
  ): Promise<OrderResult | null> {
    const coinIndex = await this.getCoinIndex(symbol);
    if (coinIndex === null) throw new Error(`Coin not found: ${symbol}`);

    const assetMeta = await this.getAssetMeta(coinIndex);
    if (!assetMeta) throw new Error(`Asset metadata not found for ${symbol}`);

    const isBuy = side === 'long';
    const retryBps = [0, 2, 5, 10, 20];
    let remainingSize = size;
    let totalFilled = 0;
    let weightedPriceSum = 0;
    let lastOrderId = '';

    for (let attempt = 0; attempt < retryBps.length; attempt++) {
      if (remainingSize <= 0) break;

      const slippageBps = retryBps[attempt];
      const top = await this.getTopOfBook(symbol);

      if (!top) {
        logger.warn({ symbol, attempt, label: this.label }, 'No top-of-book available for execution');
        await this.sleep(50);
        continue;
      }

      const orderSize = this.formatHlSize(remainingSize, assetMeta.szDecimals);
      const rawPrice = this.getAggressiveIocPrice(side, top, slippageBps);
      const marketPrice = this.formatHlPerpPrice(rawPrice, assetMeta.szDecimals);

      try {
        logger.debug(
          {
            label: this.label,
            symbol,
            side,
            remainingSize,
            orderSize,
            totalFilled,
            attempt: attempt + 1,
            slippageBps,
            bestBid: top.bestBid,
            bestAsk: top.bestAsk,
            rawPrice,
            marketPrice,
          },
          'Submitting IOC order'
        );

        const orderResult = await this.exchangeClient.order({
          orders: [
            {
              a: coinIndex,
              b: isBuy,
              p: marketPrice,
              s: orderSize,
              r: false,
              t: {
                limit: {
                  tif: 'Ioc',
                },
              },
            },
          ],
          grouping: 'na',
        });

        const status = this.extractOrderStatus(orderResult);

        if (!status) {
          logger.warn(
            { symbol, side, attempt: attempt + 1, label: this.label },
            'Missing order status'
          );
          await this.sleep(40);
          continue;
        }

        if ('error' in status) {
          logger.warn(
            {
              symbol,
              side,
              attempt: attempt + 1,
              slippageBps,
              error: status.error,
              label: this.label,
            },
            'IOC order returned error'
          );
          await this.sleep(40 + attempt * 40);
          continue;
        }

        if ('filled' in status) {
          const filledSize = parseFloat(status.filled.totalSz) || 0;
          const avgPx = parseFloat(status.filled.avgPx) || 0;
          lastOrderId = status.filled.oid.toString();

          if (filledSize > 0) {
            weightedPriceSum += avgPx * filledSize;
            totalFilled += filledSize;
            remainingSize = Number((size - totalFilled).toFixed(assetMeta.szDecimals));

            logger.info(
              {
                label: this.label,
                symbol,
                side,
                attempt: attempt + 1,
                slippageBps,
                orderId: lastOrderId,
                filledSize,
                avgPx,
                totalFilled,
                remainingSize,
              },
              'IOC order filled'
            );

            // Fully filled — done
            if (remainingSize <= 0) break;

            // Partial fill — invalidate book cache and retry remaining
            this.bookCache.delete(symbol.toUpperCase());
            logger.info(
              { symbol, totalFilled, remainingSize, label: this.label },
              'Partial fill — retrying remaining size'
            );
            await this.sleep(40);
            continue;
          }
        } else if ('resting' in status) {
          lastOrderId = status.resting.oid.toString();
        }

        // No fill on this attempt
        logger.warn(
          { symbol, side, attempt: attempt + 1, slippageBps, label: this.label },
          'IOC order not filled'
        );
        await this.sleep(40 + attempt * 40);
      } catch (error) {
        logger.warn(
          { error, symbol, side, attempt: attempt + 1, slippageBps, label: this.label },
          'IOC submit failed, retrying'
        );
        await this.sleep(40 + attempt * 40);
      }
    }

    if (totalFilled <= 0) {
      logger.error({ symbol, side, size, label: this.label }, 'All IOC retries failed — no fills');
      return null;
    }

    const avgExecutedPrice = weightedPriceSum / totalFilled;
    const fillStatus = remainingSize <= 0 ? 'filled' : 'partial';

    if (fillStatus === 'partial') {
      logger.warn(
        { symbol, side, requested: size, filled: totalFilled, remaining: remainingSize, label: this.label },
        'Order partially filled after all retries'
      );
    }

    return {
      orderId: lastOrderId,
      symbol,
      side,
      size: totalFilled,
      executedPrice: avgExecutedPrice,
      timestamp: Date.now(),
      status: fillStatus,
    };
  }

  async placeStopLoss(
    symbol: string,
    entryPrice: number,
    side: 'long' | 'short',
    positionSize: number,
    slPercentage: number = 1.5
  ): Promise<boolean> {
    try {
      const coinIndex = await this.getCoinIndex(symbol);
      if (coinIndex === null) {
        throw new Error(`Coin not found: ${symbol}`);
      }

      const assetMeta = await this.getAssetMeta(coinIndex);
      if (!assetMeta) {
        throw new Error(`Asset metadata not found for ${symbol}`);
      }

      const slPrice = side === 'long'
        ? entryPrice * (1 - slPercentage / 100)
        : entryPrice * (1 + slPercentage / 100);
      const formattedSlPrice = this.formatHlPerpPrice(slPrice, assetMeta.szDecimals);

      const isLongPosition = side === 'long';

      logger.info(
        { label: this.label, symbol, entryPrice, side, slPercentage, slPrice: formattedSlPrice },
        'Placing stop loss order'
      );

      const slResult = await this.exchangeClient.order({
        orders: [
          {
            a: coinIndex,
            b: !isLongPosition,
            p: formattedSlPrice,
            s: positionSize.toString(),
            r: true,
            t: {
              trigger: {
                isMarket: true,
                triggerPx: formattedSlPrice,
                tpsl: 'sl',
              },
            },
          },
        ],
        grouping: 'na',
      });

      if (slResult?.status === 'ok') {
        logger.info(
          { label: this.label, symbol, slPrice: formattedSlPrice },
          'Stop loss order placed successfully'
        );
        return true;
      }

      logger.error({ label: this.label, symbol, response: slResult?.response }, 'Failed to place SL order');
      return false;
    } catch (error) {
      logger.error({ error, symbol, label: this.label }, 'Error placing stop loss');
      return false;
    }
  }

  async closePosition(symbol: string): Promise<OrderResult | null> {
    try {
      const position = await this.getPosition(symbol);

      if (!position || position.size === 0) {
        logger.info({ symbol, label: this.label }, 'No position to close');
        return null;
      }

      const closeSide = position.side === 'long' ? 'short' : 'long';

      return await this.placeMarketOrder(symbol, closeSide, position.size);
    } catch (error) {
      logger.error({ error, symbol, label: this.label }, 'Failed to close position');
      return null;
    }
  }

  async openPosition(
    symbol: string,
    side: 'long' | 'short',
    size: number,
    stopLossPercent: number = 1.5
  ): Promise<{ opened: OrderResult; slPlaced: boolean } | null> {
    try {
      const startTime = Date.now();

      logger.info(
        { label: this.label, symbol, side, size, stopLossPercent },
        'Opening position'
      );

      const openResult = await this.placeMarketOrder(symbol, side, size);

      if (!openResult) {
        logger.error({ label: this.label, symbol, side, size }, 'Failed to open position');
        return null;
      }

      // Place stop loss
      let slPlaced = false;
      if (openResult.executedPrice > 0) {
        slPlaced = await this.placeStopLoss(symbol, openResult.executedPrice, side, openResult.size, stopLossPercent);
        logger.info(
          { label: this.label, symbol, entryPrice: openResult.executedPrice, side, stopLossPercent, slPlaced },
          'SL placement attempted'
        );
      } else {
        logger.warn({ label: this.label, symbol }, 'Could not place SL - no filled price available');
      }

      const latency = Date.now() - startTime;
      logger.info(
        { label: this.label, symbol, side, size, latencyMs: latency },
        'Position opened successfully'
      );

      return { opened: openResult, slPlaced };
    } catch (error) {
      logger.error({ error, symbol, side, size, label: this.label }, 'Open position failed');
      return null;
    }
  }

  getLabel(): string {
    return this.label;
  }

  getAddress(): string {
    return this.userAddress;
  }
}

// Two wallet instances: one for longs, one for shorts
export const longWalletClient = new HyperliquidClient(config.longWalletKeyHex, 'long-wallet');
export const shortWalletClient = new HyperliquidClient(config.shortWalletKeyHex, 'short-wallet');

// Helper to get the right client by side
export function getClientForSide(side: 'long' | 'short'): HyperliquidClient {
  return side === 'long' ? longWalletClient : shortWalletClient;
}
