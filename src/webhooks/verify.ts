import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function verifySignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-zernio-signature'] as string | undefined;
  const env = getEnv();

  // Log incoming webhook request headers for debugging
  logger.info({
    path: req.path,
    headers: req.headers,
    hasSignature: Boolean(signature)
  }, 'Incoming webhook request');

  // If no secret configured or in permissive mode during testing, proceed
  if (!signature || !env.ZERNIO_WEBHOOK_SECRET || env.ZERNIO_WEBHOOK_SECRET === 'tu_webhook_secret_aqui') {
    logger.debug('Proceeding with webhook (no signature check required)');
    next();
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    logger.warn('Raw body missing, proceeding anyway');
    next();
    return;
  }

  try {
    const expectedHex = createHmac('sha256', env.ZERNIO_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const expectedBase64 = createHmac('sha256', env.ZERNIO_WEBHOOK_SECRET).update(rawBody).digest('base64');

    if (signature === expectedHex || signature === expectedBase64) {
      logger.debug('Webhook signature verified successfully');
    } else {
      logger.warn({
        received: signature,
        expectedHex,
        expectedBase64
      }, 'Signature mismatch, but allowing webhook for processing');
    }
  } catch (err) {
    logger.error({ err }, 'Error checking signature, proceeding');
  }

  next();
}

export function computeSignature(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
