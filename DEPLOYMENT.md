# Deployment Guide - Hyperliquid Scalping Bot

## Local Development

### 1. Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your testnet credentials
```

### 2. Run

```bash
npm run dev
```

Server will start on port 3000. Check health:

```bash
curl http://localhost:3000/health
```

### 3. Test Webhook

```bash
WEBHOOK_SECRET=test-secret ./test-webhook.sh long BTCUSD 0.1
```

## Docker Deployment

### Testnet

```bash
docker-compose up bot-testnet
```

Testnet bot runs on port 3001.

### Mainnet

```bash
docker-compose up bot-mainnet
```

Mainnet bot runs on port 3000.

### Custom Build

```bash
docker build -t my-bot:latest .
docker run -p 3000:3000 \
  -e ENV=testnet \
  -e HYPERLIQUID_TESTNET_API_KEY=$KEY \
  -e HYPERLIQUID_TESTNET_PRIVATE_KEY=$SECRET \
  -e WEBHOOK_SECRET=$WEBHOOK_SECRET \
  my-bot:latest
```

## VPS Deployment (Recommended for Production)

### 1. Setup VPS (DigitalOcean/Linode/AWS)

- Choose Ubuntu 22.04 LTS
- Create API key for remote deployment
- Allow port 3000 (or your custom port) in firewall

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### 3. Deploy

```bash
git clone <repo> hyperliquid-bot
cd hyperliquid-bot

# Create .env with production credentials
cat > .env << EOF
ENV=mainnet
HYPERLIQUID_MAINNET_API_KEY=$YOUR_MAINNET_KEY
HYPERLIQUID_MAINNET_PRIVATE_KEY=$YOUR_MAINNET_SECRET
WEBHOOK_SECRET=$YOUR_WEBHOOK_SECRET
LOG_LEVEL=info
EOF

# Run
docker-compose up -d bot-mainnet
```

### 4. Monitor

```bash
docker-compose logs -f bot-mainnet
```

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `ENV` | Yes | - | `testnet` or `mainnet` |
| `HYPERLIQUID_TESTNET_API_KEY` | If testnet | - | Testnet API key |
| `HYPERLIQUID_TESTNET_PRIVATE_KEY` | If testnet | - | Testnet private key |
| `HYPERLIQUID_MAINNET_API_KEY` | If mainnet | - | Mainnet API key |
| `HYPERLIQUID_MAINNET_PRIVATE_KEY` | If mainnet | - | Mainnet private key |
| `WEBHOOK_SECRET` | Recommended | - | HMAC signing secret |
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `LOG_LEVEL` | No | info | debug/info/warn/error |
| `MAX_POSITION_SIZE` | No | 10 | Max order size |
| `MIN_ORDER_SIZE` | No | 0.01 | Min order size |
| `MAX_LEVERAGE` | No | 5 | Max leverage allowed |
| `RATE_LIMIT_MS` | No | 1000 | Min ms between signals per symbol |

## TradingView Integration

### 1. Create Alert

In TradingView Pine Script strategy:

```pinescript
alertcondition(buySignal, title="Buy Signal", message=json.stringify(
  map(
    "signal", "long",
    "symbol", "BTCUSD",
    "qty", 0.1,
    "leverage", 1
  )
))
```

### 2. Set Webhook URL

In alert dialog → Webhook URL:

```
https://your-domain.com:3000/webhook
```

### 3. Set Headers

Custom headers:
```
X-Signature: <generated_hmac_signature>
```

To generate signature:
```bash
python3 -c "
import hmac, json
secret = 'YOUR_WEBHOOK_SECRET'
payload = json.dumps({'signal': 'long', 'symbol': 'BTCUSD', 'qty': 0.1})
sig = hmac.new(secret.encode(), payload.encode(), 'sha256').hexdigest()
print(sig)
"
```

## Monitoring & Alerts

### Health Check

```bash
curl https://your-domain.com/health
```

### View Logs

```bash
docker-compose logs -f bot-mainnet
```

### Setup Log Aggregation (Optional)

Using Sentry or Datadog:

```bash
npm install @sentry/node
```

Then configure in `src/server.ts`:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: config.env,
});
```

## Security Checklist

- [ ] Use strong `WEBHOOK_SECRET` (32+ chars)
- [ ] Never commit `.env` file
- [ ] Use environment-specific API keys
- [ ] Enable VPS firewall
- [ ] Use HTTPS for webhook endpoint
- [ ] Monitor API key usage in Hyperliquid
- [ ] Set up alerts for errors
- [ ] Test on testnet first
- [ ] Start with small position sizes
- [ ] Monitor 24/7 initially

## Troubleshooting

### Bot won't start

```bash
# Check logs
docker-compose logs bot-mainnet

# Common issues:
# - Invalid API keys
# - Port already in use
# - Missing environment variables
```

### High latency

- Check network connectivity
- Monitor CPU/memory usage
- Check API rate limits
- Verify Hyperliquid API status

### Webhook not received

- Check TradingView webhook URL
- Verify firewall allows port
- Test webhook manually with `test-webhook.sh`
- Check logs for errors

### Orders not filling

- Verify sufficient balance
- Check leverage settings
- Review position size limits
- Check Hyperliquid API status

## Rollback

```bash
# Stop current bot
docker-compose down

# Switch to previous version
git checkout <commit-hash>

# Redeploy
docker-compose up -d bot-mainnet
```

## Update Procedure

```bash
# Pull latest code
git pull origin main

# Rebuild image
docker-compose build

# Restart bot
docker-compose up -d bot-mainnet

# Monitor
docker-compose logs -f bot-mainnet
```

## Performance Tips

1. **Connection pooling** - Enabled by default
2. **Async I/O** - Non-blocking operations
3. **Rate limiting** - Prevents webhook spam
4. **Parallel execution** - Close + open simultaneously
5. **Minimal dependencies** - Lightweight stack

## Support

For issues:
1. Check logs: `docker-compose logs bot-mainnet`
2. Enable debug logging: `LOG_LEVEL=debug`
3. Test webhook locally first
4. Verify API credentials
5. Check Hyperliquid status page
