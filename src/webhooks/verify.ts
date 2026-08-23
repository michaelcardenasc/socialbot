import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function verifySignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-zernio-signature'] as string | undefined;

  const env = getEnv();
  // If webhook secret is not set, allow request in dev/test
  if (!env.ZERNIO_WEBHOOK_SECRET || env.ZERNIO_WEBHOOK_SECRET === 'tu_webhook_secret_aqui') {
    logger.debug('Skipping signature verification (secret not set)');
    next();
    return;
  }

  if (!signature) {
    logger.warn({ headers: req.headers }, 'Missing X-Zernio-Signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!rawBody) {
    logger.error('Raw body not available for signature verification');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  const expectedSignatureHex = createHmac('sha256', env.ZERNIO_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const expectedSignatureBase64 = createHmac('sha256', env.ZERNIO_WEBHOOK_SECRET).update(rawBody).digest('base64');

  const matchesHex = signature === expectedSignatureHex;
  const matchesBase64 = signature === expectedSignatureBase64;

  if (!matchesHex && !matchesBase64) {
    logger.warn({
      receivedSignature: signature,
      expectedHex: expectedSignatureHex,
      expectedBase64: expectedSignatureBase64
    }, 'Invalid webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

export function computeSignature(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
