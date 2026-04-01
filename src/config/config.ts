import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

dotenv.config();

if (!process.env.ENV) {
  logger.error('ENV not set. Please set ENV=testnet or ENV=mainnet');
  process.exit(1);
}

const ENV = process.env.ENV as 'testnet' | 'mainnet';

// Resolve config directory
// Use process.cwd() + known path as a portable approach that works in both ESM and CJS (Jest)
function resolveConfigDir(): string {
  // In production (dist/config/config.js), __dirname-equivalent is the dist/config folder
  // In dev (ts-node), it's src/config
  // Try known locations relative to project root
  const candidates = [
    path.join(process.cwd(), 'src', 'config'),
    path.join(process.cwd(), 'dist', 'config'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'default-qty.json'))) {
      return dir;
    }
  }
  return candidates[0]; // fallback to src/config
}

const CONFIG_DIR = resolveConfigDir();

function loadJsonMap(filename: string, label: string): Record<string, number> {
  try {
    const filePath = path.join(CONFIG_DIR, filename);
    const data = fs.readFileSync(filePath, 'utf-8');
    const map = JSON.parse(data) as Record<string, number>;
    logger.debug({ mapSize: Object.keys(map).length }, `Loaded ${label}`);
    return map;
  } catch (error) {
    logger.warn({ error }, `Failed to load ${filename}, using empty map`);
    return {};
  }
}

const defaultQtyMap = loadJsonMap('default-qty.json', 'default qty map');
const defaultStopLossMap = loadJsonMap('default-stop-loss.json', 'default stop loss map');
const maxPositionSizeMap = loadJsonMap('max-position-size.json', 'max position size map');

if (!['testnet', 'mainnet'].includes(ENV)) {
  logger.error(`Invalid ENV: ${ENV}. Must be testnet or mainnet`);
  process.exit(1);
}

const ensureHexPrefix = (key: string): `0x${string}` => {
  if (key.startsWith('0x')) {
    return key as `0x${string}`;
  }
  return `0x${key}` as `0x${string}`;
};

// Load wallet keys for long and short wallets
const LONG_WALLET_KEY_ENV =
  ENV === 'testnet'
    ? process.env.LONG_WALLET_TESTNET_PRIVATE_KEY
    : process.env.LONG_WALLET_MAINNET_PRIVATE_KEY;

const SHORT_WALLET_KEY_ENV =
  ENV === 'testnet'
    ? process.env.SHORT_WALLET_TESTNET_PRIVATE_KEY
    : process.env.SHORT_WALLET_MAINNET_PRIVATE_KEY;

if (!LONG_WALLET_KEY_ENV) {
  logger.error(
    `Missing long wallet private key for ${ENV}. Check .env file for LONG_WALLET_${ENV.toUpperCase()}_PRIVATE_KEY`
  );
  process.exit(1);
}

if (!SHORT_WALLET_KEY_ENV) {
  logger.error(
    `Missing short wallet private key for ${ENV}. Check .env file for SHORT_WALLET_${ENV.toUpperCase()}_PRIVATE_KEY`
  );
  process.exit(1);
}

const LONG_WALLET_KEY_HEX = ensureHexPrefix(LONG_WALLET_KEY_ENV);
const SHORT_WALLET_KEY_HEX = ensureHexPrefix(SHORT_WALLET_KEY_ENV);

if (!process.env.WEBHOOK_SECRET) {
  logger.warn('WEBHOOK_SECRET not set. Webhook signature verification disabled.');
}

const API_URL =
  ENV === 'testnet'
    ? 'https://api.hyperliquid-testnet.xyz'
    : 'https://api.hyperliquid.xyz';

export const config = {
  env: ENV,
  longWalletKeyHex: LONG_WALLET_KEY_HEX,
  shortWalletKeyHex: SHORT_WALLET_KEY_HEX,
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  apiUrl: API_URL,
  trading: {
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '10'),
    minOrderSize: parseFloat(process.env.MIN_ORDER_SIZE || '0.01'),
    maxLeverage: parseFloat(process.env.MAX_LEVERAGE || '5'),
    rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '60000', 10),
    marketOrderSlippagePercent: parseFloat(process.env.MARKET_ORDER_SLIPPAGE_PERCENT || '10'),
    defaultQtyMap,
    defaultStopLossMap,
    maxPositionSizeMap,
  },
};

logger.info(
  { env: ENV, apiUrl: API_URL },
  'Configuration loaded for dual-wallet system (long-wallet + short-wallet)'
);
