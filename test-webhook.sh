#!/bin/bash

# Test webhook script for Hyperliquid Scalping Bot
# Usage: bash test-webhook.sh [signal] [symbol] [qty]

WEBHOOK_SECRET=${WEBHOOK_SECRET:-"test-secret"}
ENDPOINT=${ENDPOINT:-"http://localhost:3000/webhook"}

SIGNAL=${1:-"long"}
SYMBOL=${2:-"BTCUSD"}
QTY=${3:-"0.1"}

# Create payload
PAYLOAD=$(cat <<EOF
{
  "signal": "$SIGNAL",
  "symbol": "$SYMBOL",
  "qty": $QTY,
  "leverage": 1
}
EOF
)

# Generate HMAC signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')

echo "=== Testing Webhook ==="
echo "Endpoint: $ENDPOINT"
echo "Payload: $PAYLOAD"
echo "Signature: $SIGNATURE"
echo ""

# Send request
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -d "$PAYLOAD" \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "Done!"
