import express, { Request, Response } from 'express';
import { config } from './config/config.js';
import logger from './utils/logger.js';
import { hlClient } from './exchange/hyperliquid.js';
import { handlePositionFlip } from './strategies/position-flipper.js';
import { validateAlert, checkRateLimit, validateOrderSize, validateLeverage } from './security/validator.js';
import { normalizeSymbol } from './utils/symbol.js';
import { verifyWebhookSecret } from './security/auth.js';
import { WebhookResponse } from './types/alert.js';

const app = express();

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      },
      'HTTP request'
    );
  });
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: config.env,
    timestamp: Date.now(),
  });
});

// TradingView webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
  const webhookStartTime = Date.now();

  // Immediate acknowledgment (don't block response)
  res.status(202).json({
    status: 'received',
    timestamp: Date.now(),
  });

  // Process async in background
  handleWebhook(req).catch((error) => {
    logger.error({ error }, 'Unhandled webhook error');
  });
});

async function handleWebhook(req: Request): Promise<void> {
  try {
    // Verify webhook secret from query parameter or header
    // TradingView sends: http://server/webhook?secret=YOUR_SECRET
    const secretParam = (req.query.secret as string) || (req.headers['x-webhook-secret'] as string);
    
    if (!verifyWebhookSecret(secretParam)) {
      logger.error('Webhook secret verification failed');
      return;
    }

    // Validate alert format
    const alert = validateAlert(req.body);
    if (!alert) {
      logger.error({ body: req.body }, 'Invalid alert format');
      return;
    }

    // Log the alert data for debugging/visibility
    logger.info({ alert }, 'Received valid alert');

    // Rate limiting
    if (!checkRateLimit(alert.ticker)) {
      logger.warn(
        { ticker: alert.ticker },
        'Webhook rate limited'
      );
      return;
    }

    // Use default position size if not specified in alert
    const normalized = normalizeSymbol(alert.ticker);
    const defaultQty = (config.trading.defaultQtyMap as Record<string, number>)[normalized] || 0.01;
    const positionSize = alert.qty ?? defaultQty;

    // Validate order parameters
    if (!validateOrderSize(positionSize)) {
      logger.error(
        { qty: positionSize },
        'Invalid order size'
      );
      return;
    }

    if (!validateLeverage(alert.leverage || 1)) {
      logger.error(
        { leverage: alert.leverage },
        'Invalid leverage'
      );
      return;
    }

    // Execute position flip
    const result = await handlePositionFlip(alert);

    if (result) {
      logger.info(
        {
          ticker: alert.ticker,
          action: alert.action,
          price: alert.price,
          latencyMs: result.totalLatencyMs,
          result,
        },
        'Webhook processed successfully'
      );
    } else {
      logger.error(
        { ticker: alert.ticker },
        'Position flip failed'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Webhook processing error');
  }
}

// Error handler
app.use((err: any, req: Request, res: Response, _next: any) => {
  logger.error({ error: err }, 'Unhandled error');
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    timestamp: Date.now(),
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    timestamp: Date.now(),
  });
});

// Startup
async function startup() {
  try {
    // Validate API credentials before starting
    const isValid = await hlClient.validateApiKeys();
    if (!isValid) {
      logger.error('Failed to validate Hyperliquid API credentials');
      process.exit(1);
    }

    app.listen(config.port, config.host, () => {
      logger.info(
        {
          host: config.host,
          port: config.port,
          environment: config.env,
          webhookUrl: `http://${config.host}:${config.port}/webhook`,
        },
        'Server started'
      );
    });
  } catch (error) {
    logger.error({ error }, 'Startup failed');
    process.exit(1);
  }
}

startup();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
