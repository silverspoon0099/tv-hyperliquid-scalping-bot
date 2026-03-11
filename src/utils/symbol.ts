/**
 * Normalize a ticker string from TradingView into the format expected by
 * Hyperliquid. This mirrors the logic that was previously embedded in
 * `position-flipper.ts` and is reused when looking up default quantities.
 */
export function normalizeSymbol(ticker: string): string {
  return ticker
    .split('.')[0]       // remove .P suffix
    .replace('USDC', '') // strip quote portion
    .toUpperCase();
}
