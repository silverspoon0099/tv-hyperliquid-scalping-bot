import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

dotenv.config();

if (!process.env.ENV) {
  logger.error('ENV not set. Please set ENV=testnet or ENV=mainnet');
  process.exit(1);
}

const ENV = process.env.ENV as 'testnet' | 'mainnet';

// Load default quantities for symbols (used when alert.qty is missing)
const loadDefaultQtyMap = (): Record<string, number> => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const defaultQtyPath = path.join(__dirname, 'default-qty.json');
    const data = fs.readFileSync(defaultQtyPath, 'utf-8');
    const map = JSON.parse(data) as Record<string, number>;
    logger.debug({ mapSize: Object.keys(map).length }, 'Loaded default qty map');
    return map;
  } catch (error) {
    logger.warn({ error }, 'Failed to load default-qty.json, using empty map');
    return {};
  }
};

// Load default stop loss percentages for symbols (used when alert.stop_loss is missing)
const loadDefaultStopLossMap = (): Record<string, number> => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const defaultStopLossPath = path.join(__dirname, 'default-stop-loss.json');
    const data = fs.readFileSync(defaultStopLossPath, 'utf-8');
    const map = JSON.parse(data) as Record<string, number>;
    logger.debug({ mapSize: Object.keys(map).length }, 'Loaded default stop loss map');
    return map;
  } catch (error) {
    logger.warn({ error }, 'Failed to load default-stop-loss.json, using 1.5% default');
    return {};
  }
};

// Load max position sizes for symbols (used for per-token position size limits)
const loadMaxPositionSizeMap = (): Record<string, number> => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const maxPositionSizePath = path.join(__dirname, 'max-position-size.json');
    const data = fs.readFileSync(maxPositionSizePath, 'utf-8');
    const map = JSON.parse(data) as Record<string, number>;
    logger.debug({ mapSize: Object.keys(map).length }, 'Loaded max position size map');
    return map;
  } catch (error) {
    logger.warn({ error }, 'Failed to load max-position-size.json, using fallback');
    return {};
  }
};

const defaultQtyMap = loadDefaultQtyMap();
const defaultStopLossMap = loadDefaultStopLossMap();
const maxPositionSizeMap = loadMaxPositionSizeMap();

if (!['testnet', 'mainnet'].includes(ENV)) {
  logger.error(`Invalid ENV: ${ENV}. Must be testnet or mainnet`);
  process.exit(1);
}

const PRIVATE_KEY_ENV =
  ENV === 'testnet'
    ? process.env.HYPERLIQUID_TESTNET_PRIVATE_KEY
    : process.env.HYPERLIQUID_MAINNET_PRIVATE_KEY;

if (!PRIVATE_KEY_ENV) {
  logger.error(
    `Missing private key for ${ENV}. Check .env file for HYPERLIQUID_${ENV.toUpperCase()}_PRIVATE_KEY`
  );
  process.exit(1);
}

const ensureHexPrefix = (key: string): `0x${string}` => {
  if (key.startsWith('0x')) {
    return key as `0x${string}`;
  }
  return `0x${key}` as `0x${string}`;
};

const PRIVATE_KEY_HEX = ensureHexPrefix(PRIVATE_KEY_ENV);

if (!process.env.WEBHOOK_SECRET) {
  logger.warn('WEBHOOK_SECRET not set. Webhook signature verification disabled.');
}

const API_URL =
  ENV === 'testnet'
    ? 'https://api.hyperliquid-testnet.xyz'
    : 'https://api.hyperliquid.xyz';

export const config = {
  env: ENV,
  privateKeyHex: PRIVATE_KEY_HEX,
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  apiUrl: API_URL,
  trading: {
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '10'),
    minOrderSize: parseFloat(process.env.MIN_ORDER_SIZE || '0.01'),
    maxLeverage: parseFloat(process.env.MAX_LEVERAGE || '5'),
    rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '60000', 10), // 1 minutes default
    marketOrderSlippagePercent: parseFloat(process.env.MARKET_ORDER_SLIPPAGE_PERCENT || '10'),
    defaultQtyMap,
    defaultStopLossMap,
    maxPositionSizeMap,
  },
};

logger.info(`Configuration loaded for ${ENV} environment at ${API_URL}`);
