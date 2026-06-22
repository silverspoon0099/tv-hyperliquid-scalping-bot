import express, { Request, Response } from 'express';
import { config } from './config/config.js';
import logger from './utils/logger.js';
import { longWalletClient, shortWalletClient } from './exchange/hyperliquid.js';
import { handleOpen, handleClose } from './strategies/position-flipper.js';
import { validateAlert, checkRateLimit, validateOrderSize, validateLeverage } from './security/validator.js';
import { normalizeSymbol } from './utils/symbol.js';
import { verifyWebhookSecret } from './security/auth.js';
import { OpenAlert, CloseAlert } from './types/alert.js';

const app = express();

// Disable Express fingerprinting
app.disable('x-powered-by');

// Trust reverse proxy (Nginx/Caddy) so req.ip uses X-Forwarded-For
app.set('trust proxy', 'loopback');

// TradingView webhook IPs (https://www.tradingview.com/support/solutions/43000529348)
const TRADINGVIEW_IPS = new Set([
  '52.89.214.238',
  '34.212.75.30',
  '54.218.53.128',
  '52.32.178.7',
]);

// Early reject: only allow known routes, drop everything else silently
app.use((req: Request, res: Response, next) => {
  const isHealth = req.method === 'GET' && req.path === '/health';
  const isWebhook = req.method === 'POST' && req.path === '/webhook';

  if (!isHealth && !isWebhook) {
    // Silent drop — no JSON body, no server info, just close
    res.status(404).end();
    return;
  }

  next();
});

// IP allowlist for webhook (skip in test/dev if needed)
app.post('/webhook', (req: Request, res: Response, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  // Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 -> 1.2.3.4)
  const normalizedIp = clientIp.replace(/^::ffff:/, '');

  if (config.env === 'mainnet' && !TRADINGVIEW_IPS.has(normalizedIp)) {
    logger.warn({ ip: normalizedIp }, 'Webhook rejected — IP not in TradingView allowlist');
    res.status(403).end();
    return;
  }

  next();
});

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

// Health check (no sensitive info exposed)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
  });
});

// TradingView webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
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
    // Verify webhook secret
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

    logger.info({ alert }, 'Received valid alert');

    // Route based on action type
    if (alert.action === 'close') {
      // Close signal
      const closeAlert = alert as CloseAlert;

      // Rate limiting by ticker+side for close
      if (!checkRateLimit(`${closeAlert.ticker}:close:${closeAlert.side}`)) {
        logger.warn({ ticker: closeAlert.ticker, side: closeAlert.side }, 'Close webhook rate limited');
        return;
      }

      const result = await handleClose(closeAlert);

      if (result) {
        logger.info(
          {
            ticker: closeAlert.ticker,
            side: closeAlert.side,
            reason: closeAlert.reason,
            latencyMs: result.totalLatencyMs,
          },
          'Close webhook processed successfully'
        );
      } else {
        logger.error({ ticker: closeAlert.ticker, side: closeAlert.side }, 'Close position failed');
      }
    } else {
      // Open signal (action is "open")
      const openAlert = alert as OpenAlert;

      // Rate limiting
      if (!checkRateLimit(`${openAlert.ticker}:open:${openAlert.side}`)) {
        logger.warn({ ticker: openAlert.ticker, side: openAlert.side }, 'Open webhook rate limited');
        return;
      }

      // Use default position size if not specified
      const normalized = normalizeSymbol(openAlert.ticker);
      const defaultQty = (config.trading.defaultQtyMap as Record<string, number>)[normalized] || 0.01;
      const positionSize = openAlert.qty ?? defaultQty;

      const defaultStopLoss = (config.trading.defaultStopLossMap as Record<string, number>)[normalized] || 1.5;
      const stopLoss = openAlert.stop_loss ?? defaultStopLoss;

      // Set defaults on alert
      if (!openAlert.qty) openAlert.qty = positionSize;
      if (!openAlert.stop_loss) openAlert.stop_loss = stopLoss;

      // Validate order parameters
      if (!validateOrderSize(positionSize, normalized)) {
        logger.error({ qty: positionSize }, 'Invalid order size');
        return;
      }

      if (!validateLeverage(openAlert.leverage || 1)) {
        logger.error({ leverage: openAlert.leverage }, 'Invalid leverage');
        return;
      }

      const result = await handleOpen(openAlert);

      if (result) {
        logger.info(
          {
            ticker: openAlert.ticker,
            side: openAlert.side,
            price: openAlert.price,
            latencyMs: result.totalLatencyMs,
            slPlaced: result.slPlaced,
          },
          'Open webhook processed successfully'
        );
      } else {
        logger.error({ ticker: openAlert.ticker }, 'Open position failed');
      }
    }
  } catch (error) {
    logger.error({ error }, 'Webhook processing error');
  }
}

// Error handler — log internally, reveal nothing externally
app.use((err: any, _req: Request, res: Response, _next: any) => {
  logger.error({ error: err }, 'Unhandled error');
  res.status(500).end();
});

// Catch-all (shouldn't reach here due to early reject, but just in case)
app.use((_req: Request, res: Response) => {
  res.status(404).end();
});

// Startup
async function startup() {
  try {
    // Validate both wallet credentials
    const [longValid, shortValid] = await Promise.all([
      longWalletClient.validateApiKeys(),
      shortWalletClient.validateApiKeys(),
    ]);

    if (!longValid) {
      logger.error('Failed to validate long-wallet API credentials');
      process.exit(1);
    }

    if (!shortValid) {
      logger.error('Failed to validate short-wallet API credentials');
      process.exit(1);
    }

    logger.info(
      {
        longWallet: longWalletClient.getAddress(),
        shortWallet: shortWalletClient.getAddress(),
      },
      'Both wallet credentials validated'
    );

    app.listen(config.port, config.host, () => {
      logger.info(
        {
          host: config.host,
          port: config.port,
          environment: config.env,
          webhookUrl: `http://${config.host}:${config.port}/webhook`,
        },
        'Server started (dual-wallet mode)'
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
