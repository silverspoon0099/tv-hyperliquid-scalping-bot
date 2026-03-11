# API Reference - Hyperliquid Scalping Bot

## Endpoints

### Health Check

**GET** `/health`

Returns bot status and uptime.

**Response:**
```json
{
  "status": "ok",
  "environment": "testnet",
  "timestamp": 1678901234567
}
```

### Webhook (TradingView Alerts)

**POST** `/webhook`

Receives TradingView alerts and executes position flips.

**Headers:**
```
Content-Type: application/json
X-Signature: <hmac-sha256-signature>
```

**Request Body:**
```json
{
  "signal": "long",
  "symbol": "BTCUSD",
  "qty": 0.1,
  "leverage": 1,
  "stopLossPercent": 0.5,
  "takeProfitPercent": 1.0
}
```

**Response (Immediate, 202):**
```json
{
  "status": "received",
  "timestamp": 1678901234567
}
```

**Processing happens asynchronously** - check logs for results.

**Success Log:**
```json
{
  "symbol": "BTCUSD",
  "newSide": "long",
  "size": 0.1,
  "totalLatencyMs": 45,
  "message": "Position flipped successfully"
}
```

## Request Validation

### Alert Schema

```typescript
{
  signal: "long" | "short"           // Required
  symbol: string                     // Required, regex: /^[A-Z0-9]+$/
  qty: number                        // Required, positive
  leverage: number                   // Optional, default: 1
  stopLossPercent: number            // Optional
  takeProfitPercent: number          // Optional
}
```

### Constraints

| Field | Min | Max |
|-------|-----|-----|
| `qty` | 0.01 | 10 (configurable) |
| `leverage` | 1 | 5 (configurable) |
| Signal frequency per symbol | 1 signal every 1000ms (configurable) |

## Error Responses

### 400 - Invalid Request

```json
{
  "status": "error",
  "message": "Invalid alert format",
  "timestamp": 1678901234567
}
```

### 401 - Invalid Signature

```json
{
  "status": "error",
  "message": "Invalid webhook signature",
  "timestamp": 1678901234567
}
```

### 429 - Rate Limited

```json
{
  "status": "error",
  "message": "Rate limit exceeded",
  "timestamp": 1678901234567
}
```

### 500 - Internal Error

```json
{
  "status": "error",
  "message": "Internal server error",
  "timestamp": 1678901234567
}
```

## Webhook Signature Generation

To sign webhook requests:

**Python:**
```python
import hmac
import json

secret = "YOUR_WEBHOOK_SECRET"
payload = json.dumps({
    "signal": "long",
    "symbol": "BTCUSD",
    "qty": 0.1
})

signature = hmac.new(
    secret.encode(),
    payload.encode(),
    "sha256"
).hexdigest()

print(signature)
```

**Node.js:**
```javascript
const crypto = require('crypto');

const secret = "YOUR_WEBHOOK_SECRET";
const payload = JSON.stringify({
    signal: "long",
    symbol: "BTCUSD",
    qty: 0.1
});

const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

console.log(signature);
```

**Bash:**
```bash
WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
PAYLOAD='{"signal":"long","symbol":"BTCUSD","qty":0.1}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')
echo $SIGNATURE
```

## cURL Examples

### Send Long Signal

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Signature: abc123..." \
  -d '{
    "signal": "long",
    "symbol": "BTCUSD",
    "qty": 0.1,
    "leverage": 2
  }'
```

### Send Short Signal

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Signature: def456..." \
  -d '{
    "signal": "short",
    "symbol": "ETHUSD",
    "qty": 0.5,
    "leverage": 3
  }'
```

### Check Health

```bash
curl http://localhost:3000/health
```

## Async Processing

The bot processes webhooks asynchronously:

1. **Receive** - Returns 202 immediately
2. **Validate** - Check signature, format, rate limits
3. **Execute** - Flip position (close old + open new in parallel)
4. **Log** - Record results and latency

**Total expected latency: 5-50ms from webhook receipt to order placement**

## Position Flip Logic

When signal received:

```
IF signal == "long" AND current_position == "short":
  - Close short position
  - Open long position (in parallel)
  
IF signal == "short" AND current_position == "long":
  - Close long position
  - Open short position (in parallel)
  
IF signal == "long" AND no_position:
  - Open long position
  
IF signal == "short" AND no_position:
  - Open short position
```

**Key: Close and open happen in parallel, not sequentially.**

## Configuration

### Environment Variables

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete list.

### Trading Limits

```bash
MAX_POSITION_SIZE=10        # Max order size
MIN_ORDER_SIZE=0.01         # Min order size
MAX_LEVERAGE=5              # Max leverage
RATE_LIMIT_MS=1000          # Min ms between signals
```

## Logging

Structured logging with pino. Example:

```json
{
  "level": "info",
  "method": "POST",
  "path": "/webhook",
  "status": 202,
  "durationMs": 5,
  "timestamp": "2024-03-10T12:30:45.123Z"
}
```

View logs:

```bash
# Development
npm run dev

# Docker
docker-compose logs -f bot-mainnet

# With debug level
LOG_LEVEL=debug npm run dev
```

## Rate Limiting

- Per-symbol rate limit: 1 signal per `RATE_LIMIT_MS` (default 1000ms)
- Prevents webhook spam
- Configurable in `.env`

Example:
```bash
RATE_LIMIT_MS=500  # Allow signal every 500ms per symbol
```

## Metrics

The bot collects metrics (internal use):

- Webhooks received
- Webhooks processed
- Webhook errors
- Positions opened/closed
- Average latency

Future: Expose via `/metrics` endpoint (Prometheus format)
