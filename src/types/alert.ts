import { z } from 'zod';

// Open signal: action is "open" — opens position in corresponding wallet based on side
export const OpenAlertSchema = z.object({
  action: z.literal('open').describe('Open action'),
  side: z.enum(['long', 'short']).describe('Position direction to open'),
  ticker: z.string().describe('Trading symbol (e.g., BTCUSDC.P)'),
  price: z.number().positive().describe('Current price from TradingView'),
  time: z.number().optional().describe('Timestamp in milliseconds'),
  qty: z.number().positive().optional().describe('Position size (optional)'),
  leverage: z.number().positive().optional().default(1).describe('Leverage multiplier (optional)'),
  stop_loss: z.number().positive().optional().describe('Stop loss percentage (optional, e.g., 1.5 for 1.5%)'),
});

// Close signal: action is "close" — closes position in the wallet matching `side`
export const CloseAlertSchema = z.object({
  action: z.literal('close').describe('Close action'),
  side: z.enum(['long', 'short']).describe('Which wallet/side to close'),
  reason: z.string().optional().describe('Reason for closing (e.g., "flip")'),
  ticker: z.string().describe('Trading symbol (e.g., TAOUSDT)'),
  price: z.number().positive().describe('Current price from TradingView'),
  time: z.number().optional().describe('Timestamp in milliseconds'),
});

// Union: either open or close
export const TradingViewAlertSchema = z.discriminatedUnion('action', [
  OpenAlertSchema,
  CloseAlertSchema,
]);

export type OpenAlert = z.infer<typeof OpenAlertSchema>;
export type CloseAlert = z.infer<typeof CloseAlertSchema>;
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

export interface OpenResult {
  opened: OrderResult;
  slPlaced: boolean;
  totalLatencyMs: number;
}

export interface CloseResult {
  closed: OrderResult;
  totalLatencyMs: number;
}

export interface WebhookResponse {
  status: 'success' | 'error';
  message: string;
  data?: OpenResult | CloseResult;
  timestamp: number;
}
