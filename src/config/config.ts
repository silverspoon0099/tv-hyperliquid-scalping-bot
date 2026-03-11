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

const defaultQtyMap = loadDefaultQtyMap();

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
    marketOrderSlippagePercent: parseFloat(process.env.MARKET_ORDER_SLIPPAGE_PERCENT || '2'),
    defaultQtyMap,
  },
};

logger.info(`Configuration loaded for ${ENV} environment at ${API_URL}`);
