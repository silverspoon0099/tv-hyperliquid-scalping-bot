import { config } from '../config/config.js';
import logger from '../utils/logger.js';

export function verifyWebhookSecret(
  providedSecret: string | undefined
): boolean {
  if (!config.webhookSecret) {
    logger.warn('WEBHOOK_SECRET not configured. Accepting all webhooks.');
    return true;
  }

  if (!providedSecret) {
    logger.error('Missing webhook secret in request');
    return false;
  }

  const isValid = providedSecret === config.webhookSecret;
  
  if (!isValid) {
    logger.error('Invalid webhook secret provided');
  }

  return isValid;
}
