import logger from './logger.js';

export class BotError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export function handleError(error: unknown): void {
  if (error instanceof BotError) {
    const level = error.severity === 'critical' ? 'error' : 'warn';
    logger[level](
      { code: error.code, severity: error.severity },
      error.message
    );

    if (error.severity === 'critical') {
      process.exit(1);
    }
  } else if (error instanceof Error) {
    logger.error({ stack: error.stack }, error.message);
  } else {
    logger.error({ error }, 'Unknown error');
  }
}

export class APIError extends BotError {
  constructor(message: string) {
    super('API_ERROR', message, 'high');
  }
}

export class ValidationError extends BotError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 'low');
  }
}

export class PositionError extends BotError {
  constructor(message: string) {
    super('POSITION_ERROR', message, 'high');
  }
}
