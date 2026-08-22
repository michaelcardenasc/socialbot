import type {
  ZernioWebhookPayload,
  ParsedZernioEvent,
  ZernioCommentData,
  ZernioMessageData,
} from '../types/zernio.types.js';

export type { ParsedZernioEvent };

export function parseWebhookPayload(payload: ZernioWebhookPayload): ParsedZernioEvent[] {
  const events: ParsedZernioEvent[] = [];
  const { event, platform, data, accountId } = payload;

  if (event === 'comment.received' || event === 'comment.created') {
    events.push({
      type: 'comment',
      platform,
      data: data as ZernioCommentData,
      accountId,
    });
  } else if (event === 'message.received') {
    const messageData = data as ZernioMessageData;
    // Check if the message contains postback payload in metadata
    if (messageData.metadata?.postbackPayload) {
      events.push({
        type: 'postback',
        platform,
        data: messageData,
        accountId,
      });
    } else {
      events.push({
        type: 'message',
        platform,
        data: messageData,
        accountId,
      });
    }
  } else if (event === 'reaction.received') {
    events.push({
      type: 'reaction',
      platform,
      data: data as ZernioMessageData,
      accountId,
    });
  }

  return events;
}
