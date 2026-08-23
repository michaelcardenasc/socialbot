import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { parseWebhookPayload } from './parser.js';
import { handleComment } from '../handlers/comment.handler.js';
import { handleMessage } from '../handlers/message.handler.js';
import { handlePostback } from '../handlers/postback.handler.js';
import type { ZernioCommentData, ZernioMessageData } from '../types/zernio.types.js';

export const webhookRouter = Router();

const processWebhook = (req: Request, res: Response) => {
  // Respond 200 immediately to stay within Zernio's 5-second window
  res.status(200).json({ received: true });

  const rawBody = req.body;

  // Log the FULL raw body so we can debug what Zernio sends
  logger.info({ rawBody: JSON.stringify(rawBody).slice(0, 1000) }, '📥 RAW webhook received');

  if (!rawBody) {
    logger.warn('Empty webhook body — skipping');
    return;
  }

  setImmediate(async () => {
    try {
      const events = parseWebhookPayload(rawBody);
      logger.info({ eventCount: events.length, types: events.map(e => e.type) }, '🔄 Parsed events');

      if (events.length === 0) {
        logger.warn({ rawBody }, '⚠️ No events parsed from payload — check event field name');
        return;
      }

      for (const event of events) {
        const accountId = event.accountId || process.env.ZERNIO_ACCOUNT_ID || '6a89cafb77555aae0164f0be';

        logger.info({ type: event.type, accountId }, '▶️ Dispatching event');

        if (event.type === 'comment') {
          await handleComment(event.data as ZernioCommentData, accountId).catch((err) =>
            logger.error({ err }, 'Error in comment handler'),
          );
        } else if (event.type === 'message') {
          await handleMessage(event.data as ZernioMessageData, accountId).catch((err) =>
            logger.error({ err }, 'Error in message handler'),
          );
        } else if (event.type === 'postback') {
          await handlePostback(event.data as ZernioMessageData, accountId).catch((err) =>
            logger.error({ err }, 'Error in postback handler'),
          );
        } else {
          logger.debug({ type: event.type }, '⏭️ Unhandled event type, skipping');
        }
      }
    } catch (err) {
      logger.error({ err, rawBody }, '❌ Fatal error processing webhook');
    }
  });
};

// All webhook routes — no signature verification to avoid blocking Zernio events
webhookRouter.post('/', processWebhook);
webhookRouter.post('/zernio', processWebhook);
