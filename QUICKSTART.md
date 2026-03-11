# Quick Start - 5 Minutes to Trading

## Prerequisites

- Node.js 18+
- Hyperliquid testnet API key + private key
- (Optional) Hyperliquid mainnet credentials

## Step 1: Clone & Install (1 min)

```bash
cd hyperliquid-scalping-bot
npm install
```

## Step 2: Configure (1 min)

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
ENV=testnet
HYPERLIQUID_TESTNET_API_KEY=your_key_here
HYPERLIQUID_TESTNET_PRIVATE_KEY=your_private_key_here
WEBHOOK_SECRET=your_secret_key_here
LOG_LEVEL=info
PORT=3000
```

## Step 3: Start Bot (30 sec)

```bash
npm run dev
```

You should see:

```
[12:30:45] INFO: Server started {
  "host": "0.0.0.0",
  "port": 3000,
  "environment": "testnet",
  "webhookUrl": "http://0.0.0.0:3000/webhook"
}
```

## Step 4: Test Webhook (1 min)

In another terminal:

```bash
cd hyperliquid-scalping-bot

# Test long signal
WEBHOOK_SECRET=your_secret_key_here ./test-webhook.sh long BTCUSD 0.1

# Test short signal
WEBHOOK_SECRET=your_secret_key_here ./test-webhook.sh short ETHUSD 0.05
```

You should see in bot terminal:

```
[12:30:50] INFO: Position flipped successfully {
  "symbol": "BTCUSD",
  "newSide": "long",
  "size": 0.1,
  "totalLatencyMs": 45
}
```

## Step 5: Configure TradingView Alert (1 min)

1. Open TradingView with your Pine Script strategy
2. Create alert → Webhook URL: `http://your-ip:3000/webhook`
3. Alert message:

```json
{
  "signal": "long",
  "symbol": "BTCUSD",
  "qty": 0.1,
  "leverage": 1
}
```

4. Set header `X-Signature` with HMAC signature

## You're Done! 🎉

Your bot is now:

✅ Listening for TradingView webhooks
✅ Flipping positions automatically
✅ Executing trades on Hyperliquid testnet

## Next: Go Live

When ready to trade on mainnet:

```bash
# Update .env.local
ENV=mainnet
HYPERLIQUID_MAINNET_API_KEY=your_mainnet_key
HYPERLIQUID_MAINNET_PRIVATE_KEY=your_mainnet_private_key

# Restart bot
npm run dev
```

## Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "environment": "testnet",
  "timestamp": 1678901234567
}
```

## Monitor Logs

Development:
```bash
npm run dev
```

Look for these messages:

- ✅ `Hyperliquid API credentials validated` - Keys work
- ✅ `Position flipped successfully` - Trade executed
- ❌ `Invalid webhook signature` - Check WEBHOOK_SECRET
- ❌ `Rate limit exceeded` - Signals too frequent

## Production with Docker

```bash
docker-compose up bot-testnet
```

View logs:
```bash
docker-compose logs -f bot-testnet
```

## Common Issues

### "Invalid API key"
- Check key/secret in `.env.local`
- Verify keys are testnet if ENV=testnet
- Confirm keys aren't expired in Hyperliquid console

### "Rate limit exceeded"
- Default: max 1 signal per second per symbol
- Edit `RATE_LIMIT_MS=1000` in `.env.local`

### "Position flip failed"
- Check account balance
- Verify position size isn't too large
- Check Hyperliquid API status

### No logs showing
- Ensure `npm run dev` is running
- Check `LOG_LEVEL=info` or `LOG_LEVEL=debug`

## Key Files

- `src/server.ts` - Express webhook server
- `src/exchange/hyperliquid.ts` - Hyperliquid client
- `src/strategies/position-flipper.ts` - Core trading logic
- `src/security/auth.ts` - Webhook verification
- `.env.local` - Your configuration (gitignored)

## Read More

- [API Reference](API.md) - Endpoint details
- [Deployment Guide](DEPLOYMENT.md) - Production setup
- [Setup Guide](SETUP.md) - Detailed configuration

## Need Help?

1. Check logs: `npm run dev`
2. Enable debug: `LOG_LEVEL=debug npm run dev`
3. Test webhook manually: `./test-webhook.sh`
4. Verify health: `curl http://localhost:3000/health`

Enjoy trading! 🚀
