import { z } from 'zod';

export const TradingViewAlertSchema = z.object({
  action: z.enum(['long', 'short']).describe('Position direction'),
  ticker: z.string().describe('Trading symbol (e.g., BTCUSDC.P)'),
  price: z.number().positive().describe('Current price from TradingView'),
  time: z.number().optional().describe('Timestamp in milliseconds'),
  qty: z.number().positive().optional().describe('Position size (optional)'),
  leverage: z.number().positive().optional().default(1).describe('Leverage multiplier (optional)'),
  stop_loss: z.number().positive().optional().describe('Stop loss percentage (optional, e.g., 1.5 for 1.5%)'),
});

export type TradingViewAlert = z.infer<typeof TradingViewAlertSchema>;

export interface Position {
  symbol: string;
  side: 'long' | 'short' | null;
  size: number;
  entryPrice: number;
  leverage: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  executedPrice: number;
  timestamp: number;
  status: 'filled' | 'partial' | 'pending';
}

export interface PositionFlipResult {
  closed?: OrderResult;
  opened: OrderResult;
  totalLatencyMs: number;
}

export interface WebhookResponse {
  status: 'success' | 'error';
  message: string;
  data?: PositionFlipResult;
  timestamp: number;
}
