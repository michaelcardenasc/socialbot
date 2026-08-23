import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { parseWebhookPayload } from './parser.js';
import { handleComment } from '../handlers/comment.handler.js';
import { handleMessage } from '../handlers/message.handler.js';
import { handlePostback } from '../handlers/postback.handler.js';
import type { ParsedZernioEvent } from '../types/zernio.types.js';

export function handleWebhook(req: Request, res: Response, _next: NextFunction): void {
  // Respond immediately — Zernio requires < 5 seconds response
  res.status(200).json({ received: true });

  const raw = req.body;
  logger.info({ body: JSON.stringify(raw).slice(0, 500) }, '📥 RAW Zernio webhook received');

  if (!raw) {
    logger.warn('Empty webhook body');
    return;
  }

  let events: ParsedZernioEvent[];
  try {
    events = parseWebhookPayload(raw);
    logger.info({ eventCount: events.length, events: events.map(e => ({ type: e.type, platform: e.platform })) }, 'Parsed events');
  } catch (err) {
    logger.error({ err, body: raw }, 'Failed to parse webhook payload');
    return;
  }

  // Process events asynchronously
  setImmediate(() => {
    for (const event of events) {
      const accountId = event.accountId || process.env.ZERNIO_ACCOUNT_ID || '';
      try {
        if (event.type === 'comment') {
          handleComment(event.data as any, accountId).catch((err: Error) =>
            logger.error({ err }, 'Error in comment handler'),
          );
        } else if (event.type === 'message') {
          handleMessage(event.data as any, accountId).catch((err: Error) =>
            logger.error({ err }, 'Error in message handler'),
          );
        } else if (event.type === 'postback') {
          handlePostback(event.data as any, accountId).catch((err: Error) =>
            logger.error({ err }, 'Error in postback handler'),
          );
        } else {
          logger.debug({ type: event.type }, 'Unhandled event type, skipping');
        }
      } catch (err) {
        logger.error({ err, eventType: event.type }, 'Unexpected error dispatching event');
      }
    }
  });
}
