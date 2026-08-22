import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { verifySignature } from './verify.js';
import { parseWebhookPayload } from './parser.js';
import { handleComment } from '../handlers/comment.handler.js';
import { handleMessage } from '../handlers/message.handler.js';
import { handlePostback } from '../handlers/postback.handler.js';
import type { ZernioWebhookPayload, ZernioCommentData, ZernioMessageData } from '../types/zernio.types.js';

export const webhookRouter = Router();

const handleWebhook = (req: Request, res: Response) => {
  // Respond 200 immediately to stay within Zernio's 5-second window
  res.status(200).json({ received: true });

  const payload = req.body as ZernioWebhookPayload;

  // Process events asynchronously
  setImmediate(() => {
    try {
      const events = parseWebhookPayload(payload);
      logger.info({ eventCount: events.length, eventId: payload.eventId }, 'Processing webhook events');

      for (const event of events) {
        switch (event.type) {
          case 'comment':
            handleComment(event.data as ZernioCommentData, event.accountId).catch((err) =>
              logger.error({ err, event: event.data }, 'Error handling comment'),
            );
            break;
          case 'message':
            handleMessage(event.data as ZernioMessageData, event.accountId).catch((err) =>
              logger.error({ err }, 'Error handling message'),
            );
            break;
          case 'postback':
            handlePostback(event.data as ZernioMessageData, event.accountId).catch((err) =>
              logger.error({ err }, 'Error handling postback'),
            );
            break;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error parsing webhook payload');
    }
  });
};

// POST /webhook — Receive events
webhookRouter.post('/', verifySignature, handleWebhook);

// POST /webhook/zernio — Receive events alias
webhookRouter.post('/zernio', verifySignature, handleWebhook);
