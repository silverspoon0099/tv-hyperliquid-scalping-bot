# Hyperliquid Scalping Bot - Setup Guide

## Prerequisites

- Node.js 18+
- npm or yarn
- Hyperliquid account with API credentials (testnet + mainnet)
- TradingView paid plan (for webhook alerts)

## Quick Start

### 1. Clone and Install

```bash
cd hyperliquid-scalping-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```bash
ENV=testnet
HYPERLIQUID_TESTNET_API_KEY=your_key
HYPERLIQUID_TESTNET_PRIVATE_KEY=your_private_key
WEBHOOK_SECRET=your_secret_key
PORT=3000
LOG_LEVEL=info
```

### 3. Run Locally

```bash
npm run dev
```

Server will start on `http://localhost:3000`

Check health: `curl http://localhost:3000/health`

### 4. Deploy with Docker

```bash
# Build image
docker build -t hyperliquid-bot .

# Run testnet
docker run -p 3001:3000 \
  -e ENV=testnet \
  -e HYPERLIQUID_TESTNET_API_KEY=your_key \
  -e HYPERLIQUID_TESTNET_PRIVATE_KEY=your_private_key \
  -e WEBHOOK_SECRET=your_secret \
  hyperliquid-bot

# Or use docker-compose (recommended)
docker-compose up bot-testnet
```

### 5. Configure TradingView Alert

In your TradingView Pine Script alert:

```json
{
  "signal": "long",
  "symbol": "BTCUSD",
  "qty": 0.1,
  "leverage": 2,
  "stopLossPercent": 0.5,
  "takeProfitPercent": 1.0
}
```

Set webhook URL: `https://your-domain.com/webhook`

Add header: `X-Signature: <generated_signature>`

## Architecture

- **Low-latency async design** - No `time.sleep()`, parallel position flipping
- **Security first** - HMAC signature verification, input validation, rate limiting
- **Production ready** - Comprehensive logging, error handling, graceful shutdown
- **Testnet/Mainnet** - Easy environment switching via ENV var

## Key Features

✅ Position flipping (long→short, short→long) without delays
✅ Webhook signature verification (HMAC-SHA256)
✅ Rate limiting per symbol
✅ Order size & leverage validation
✅ Parallel close + open execution
✅ Comprehensive structured logging
✅ Docker support with environment separation
✅ Health check endpoint

## Testing

```bash
npm test
npm test:watch
```

## Development

```bash
npm run build      # Compile TypeScript
npm run lint       # Run ESLint
npm run format     # Run Prettier
npm run dev        # Development mode with ts-node
npm start          # Production mode
```

## Monitoring

Check logs:
```bash
docker logs hyperliquid-bot-testnet -f
```

Health check:
```bash
curl http://localhost:3001/health
```

## Security Notes

1. **Never** commit `.env.local` or secrets
2. **Always** use WEBHOOK_SECRET in production
3. **Test thoroughly** on testnet before mainnet
4. **Start small** with low position sizes
5. **Monitor** your bot 24/7

## Troubleshooting

### API credentials invalid
- Verify keys in `.env.local`
- Check Hyperliquid API console for key status
- Ensure keys have correct permissions

### Rate limited
- Check `RATE_LIMIT_MS` setting (default 1000ms per symbol)
- Reduce alert frequency in Pine Script

### Position flip fails
- Check account balance
- Verify leverage settings
- Review logs for specific error

## Performance

Expected latencies:
- Webhook to order: **5-20ms** (testnet)
- Close old + open new: **parallel execution** (no sequential delays)
- Total round-trip: **20-50ms** typical

## Support

Check logs with:
```bash
LOG_LEVEL=debug npm run dev
```

## Next Steps

1. Test on Hyperliquid testnet with small amounts
2. Monitor 24/7 (use a VPS for production)
3. Set up alerting for bot errors
4. Gradually increase position sizes
5. Deploy to mainnet when confident
