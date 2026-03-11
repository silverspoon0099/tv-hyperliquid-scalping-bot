import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';
import { Position, OrderResult } from '../types/alert.js';

export class HyperliquidClient {
  private exchangeClient: ExchangeClient;
  private infoClient: InfoClient;
  private account: ReturnType<typeof privateKeyToAccount>;
  private userAddress: string;
  private coinIndexCache = new Map<string, number>();
  private assetMetaCache = new Map<number, { szDecimals: number; name: string }>();
  private lastMetaFetch = 0;
  private metaCacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    const privateKeyHex = config.privateKeyHex;

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
        userAddress: this.userAddress,
        environment: config.env,
        apiUrl: config.apiUrl,
      },
      'Hyperliquid client initialized'
    );

    // Pre-fetch asset metadata on startup for faster first order
    this.initializeAssetMetadata();
  }

  private async initializeAssetMetadata(): Promise<void> {
    try {
      logger.info('Pre-fetching asset metadata on startup...');
      const meta = await this.infoClient.meta();
      
      // Cache all assets
      meta.universe.forEach((asset: any, index: number) => {
        this.assetMetaCache.set(index, {
          szDecimals: asset.szDecimals,
          name: asset.name,
        });
      });

      this.lastMetaFetch = Date.now();
      logger.info(
        { cachedAssets: this.assetMetaCache.size },
        'Asset metadata pre-loaded (24h cache)'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to pre-fetch asset metadata');
      // Don't throw - metadata will be fetched on-demand
    }
  }

  async validateApiKeys(): Promise<boolean> {
    try {
      const state = await this.infoClient.clearinghouseState({
        user: this.userAddress,
      });

      if (state?.crossMarginSummary) {
        logger.info('Hyperliquid API credentials validated');
        return true;
      }

      logger.error('Failed to validate API credentials');
      return false;
    } catch (error) {
      logger.error({ error }, 'API validation error');
      return false;
    }
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const state = await this.infoClient.clearinghouseState({
        user: this.userAddress,
      });

      if (!state?.assetPositions) {
        logger.debug({ symbol }, 'No asset positions found in state');
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

      // Match by coin name, try normalized symbol first
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
      logger.error({ error, symbol }, 'Failed to fetch position');
      return null;
    }
  }

  private async getAssetMeta(coinIndex: number) {
    // Check if we have cached metadata
    if (this.assetMetaCache.has(coinIndex)) {
      return this.assetMetaCache.get(coinIndex);
    }

    // Check if cache is still valid (within 24 hours)
    const now = Date.now();
    if (this.lastMetaFetch > 0 && now - this.lastMetaFetch < this.metaCacheTTL) {
      // Cache is valid but specific asset not cached yet - shouldn't happen, but fetch it
      logger.debug({ coinIndex }, 'Asset meta not in cache, fetching...');
    }

    // Fetch meta from API
    const meta = await this.infoClient.meta();
    const assetMeta = meta.universe[coinIndex];

    if (!assetMeta) {
      logger.error({ coinIndex }, 'Asset metadata not found');
      return null;
    }

    // Cache all assets from this meta fetch
    meta.universe.forEach((asset: any, index: number) => {
      this.assetMetaCache.set(index, {
        szDecimals: asset.szDecimals,
        name: asset.name,
      });
    });

    this.lastMetaFetch = now;
    logger.info(
      { cachedAssets: this.assetMetaCache.size },
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

      logger.warn({ symbol }, 'Coin not found in meta');
      return null;
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to get coin index');
      return null;
    }
  }

  private formatHlPerpPrice(price: number, szDecimals: number): string {
    const maxDecimals = Math.max(0, 6 - szDecimals);
  
    // Integer prices are always allowed and are the safest for large-price assets like BTC
    if (Math.abs(price) >= 30000) {
      return Math.round(price).toString();
    }
  
    // First cap decimal places
    let p = Number(price.toFixed(maxDecimals));
  
    // Then enforce max 5 significant figures for non-integers
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
  
  async placeMarketOrder(
    symbol: string,
    side: 'long' | 'short',
    size: number
  ): Promise<OrderResult | null> {
    try {
      const coinIndex = await this.getCoinIndex(symbol);
      if (coinIndex === null) {
        throw new Error(`Coin not found: ${symbol}`);
      }

      const isBuy = side === 'long';

      // Get asset metadata for correct price precision (cached, updates once per 24h)
      const assetMeta = await this.getAssetMeta(coinIndex);
      
      if (!assetMeta) {
        throw new Error(`Asset metadata not found for ${symbol}`);
      }
  
      const mids = await this.infoClient.allMids();
      const currentMid = mids[symbol];
  
      if (!currentMid) {
        throw new Error(`Could not fetch price for ${symbol}`);
      }
  
      const slippagePercent = config.trading.marketOrderSlippagePercent / 100;
      const midPrice = parseFloat(currentMid);
  
      const rawPrice = isBuy
        ? midPrice * (1 + slippagePercent)
        : midPrice * (1 - slippagePercent);
  
      const marketPrice = this.formatHlPerpPrice(rawPrice, assetMeta.szDecimals);
      const orderSize = this.formatHlSize(size, assetMeta.szDecimals);
  
      logger.debug(
        { symbol, side, size, orderSize, rawPrice, marketPrice },
        'Placing market order'
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
                tif: 'FrontendMarket',
              },
            },
          },
        ],
        grouping: 'na',
      });
  
      let orderId = Date.now().toString();
      const status = orderResult.response?.data?.statuses?.[0];
      if (status && typeof status === 'object' && 'resting' in status) {
        orderId = status.resting.oid.toString();
      } else if (status && typeof status === 'object' && 'filled' in status) {
        orderId = status.filled.oid.toString();
      }
  
      // Try to extract filled price if available
      let executedPrice = 0;
      if (status && typeof status === 'object' && 'filled' in status) {
        executedPrice = parseFloat(status.filled.avgPx) || 0;
      }

      logger.info(
        { symbol, side, size, orderId, executedPrice },
        'Market order placed successfully'
      );

      return {
        orderId,
        symbol,
        side,
        size,
        executedPrice,
        timestamp: Date.now(),
        status: 'filled',
      };
    } catch (error) {
      logger.error({ error, symbol, side, size }, 'Failed to place market order');
      return null;
    }
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

      // Calculate SL price based on position side
      // LONG: SL below entry (entry * (1 - slippage%))
      // SHORT: SL above entry (entry * (1 + slippage%))
      const slPrice = side === 'long'
        ? entryPrice * (1 - slPercentage / 100)
        : entryPrice * (1 + slPercentage / 100);
      const formattedSlPrice = this.formatHlPerpPrice(slPrice, assetMeta.szDecimals);

      const isLongPosition = side === 'long';

      logger.info(
        { symbol, entryPrice, side, slPercentage, slPrice: formattedSlPrice },
        'Placing stop loss order'
      );

      // Place SL as trigger order (stop loss)
      const slResult = await this.exchangeClient.order({
        orders: [
          {
            a: coinIndex,
            b: !isLongPosition, // Opposite side to close position
            p: formattedSlPrice,
            s: positionSize.toString(),
            r: true, // Reduce only
            t: {
              trigger: {
                isMarket: true, // Market order when triggered
                triggerPx: formattedSlPrice,
                tpsl: 'sl', // Stop loss
              },
            },
          },
        ],
        grouping: 'na',
      });

      if (slResult?.status === 'ok') {
        logger.info(
          { symbol, slPrice: formattedSlPrice },
          'Stop loss order placed successfully'
        );
        return true;
      }

      logger.error({ symbol, response: slResult?.response }, 'Failed to place SL order');
      return false;
    } catch (error) {
      logger.error({ error, symbol }, 'Error placing stop loss');
      return false;
    }
  }

  async closePosition(symbol: string): Promise<OrderResult | null> {
    try {
      const position = await this.getPosition(symbol);

      if (!position || position.size === 0) {
        logger.info({ symbol }, 'No position to close');
        return null;
      }

      const closeSide = position.side === 'long' ? 'short' : 'long';

      return await this.placeMarketOrder(symbol, closeSide, position.size);
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to close position');
      return null;
    }
  }

  async flipPosition(
    symbol: string,
    newSide: 'long' | 'short',
    size: number
  ): Promise<{ closed?: OrderResult; opened: OrderResult } | null> {
    try {
      const startTime = Date.now();
      const currentPosition = await this.getPosition(symbol);

      if (!currentPosition) {
        throw new Error('Failed to fetch current position');
      }

      // Skip if already in the desired position (no need to flip to same side)
      if (currentPosition.side === newSide && currentPosition.size > 0) {
        logger.warn(
          { symbol, currentSide: currentPosition.side, newSide, size: currentPosition.size },
          'Skip: Already in desired position'
        );
        return null;
      }

      const [closeResult, openResult] = await Promise.all([
        currentPosition.side && currentPosition.side !== newSide
          ? this.closePosition(symbol)
          : Promise.resolve(null),
        this.placeMarketOrder(symbol, newSide, size),
      ]);

      if (!openResult) {
        throw new Error('Failed to open new position');
      }

      // Set stop loss for the opened position
      // LONG: SL is 1.5% below entry (exit if price drops)
      // SHORT: SL is 1.5% above entry (exit if price rises)
      if (openResult.executedPrice > 0) {
        const slPlaced = await this.placeStopLoss(symbol, openResult.executedPrice, newSide, size, 1.5);
        logger.info(
          { symbol, entryPrice: openResult.executedPrice, side: newSide, slPercentage: 1.5, slPlaced },
          'SL placement attempted'
        );
      } else {
        logger.warn(
          { symbol },
          'Could not place SL - no filled price available'
        );
      }

      const latency = Date.now() - startTime;
      logger.info(
        { symbol, newSide, size, latencyMs: latency, closed: !!closeResult },
        'Position flipped successfully'
      );

      return {
        closed: closeResult || undefined,
        opened: openResult,
      };
    } catch (error) {
      logger.error({ error, symbol, newSide, size }, 'Position flip failed');
      return null;
    }
  }
}

export const hlClient = new HyperliquidClient();
