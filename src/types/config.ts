export interface ExchangeConfig {
  privateKeyHex: `0x${string}`;
  apiUrl: string;
}

export interface TradingConfig {
  maxPositionSize: number;
  minOrderSize: number;
  maxLeverage: number;
  rateLimitMs: number;
}

export interface ServerConfig {
  env: 'testnet' | 'mainnet';
  port: number;
  host: string;
  webhookSecret: string;
}

export interface BotConfig extends ServerConfig {
  exchange: ExchangeConfig;
  trading: TradingConfig;
}
