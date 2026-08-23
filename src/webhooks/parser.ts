import type {
  ZernioWebhookPayload,
  ParsedZernioEvent,
  ZernioCommentData,
  ZernioMessageData,
} from '../types/zernio.types.js';

export type { ParsedZernioEvent };

export function parseWebhookPayload(payload: any): ParsedZernioEvent[] {
  const events: ParsedZernioEvent[] = [];
  if (!payload) return events;

  const eventName = (payload.event || payload.type || '').toLowerCase();
  const platform = payload.platform || 'instagram';
  const accountId = payload.accountId || payload.account_id || '';
  const data = payload.data || payload.body || payload;

  if (eventName.includes('comment')) {
    const commentData: ZernioCommentData = {
      commentId: data.commentId || data.comment_id || data.id || '',
      postId: data.postId || data.post_id || data.media_id || '',
      sender: {
        id: data.sender?.id || data.from?.id || data.user_id || '',
        username: data.sender?.username || data.from?.username || data.username || 'amigo',
        name: data.sender?.name || data.from?.name || data.name,
      },
      text: data.text || data.message || data.content || '',
      parentCommentId: data.parentCommentId || data.parent_id,
    };

    events.push({
      type: 'comment',
      platform,
      data: commentData,
      accountId,
    });
  } else if (eventName.includes('message')) {
    const messageData: ZernioMessageData = {
      conversationId: data.conversationId || data.conversation_id || data.threadId || data.id || data.sender?.id || '',
      messageId: data.messageId || data.message_id || data.id || '',
      sender: {
        id: data.sender?.id || data.from?.id || data.participantId || data.user_id || '',
        username: data.sender?.username || data.from?.username || data.participantUsername || data.username || 'amigo',
        name: data.sender?.name || data.from?.name || data.participantName || data.name,
      },
      text: data.text || data.message || data.content || '',
      attachments: data.attachments || [],
      metadata: data.metadata || {
        postbackPayload: data.postbackPayload || data.payload,
        postbackTitle: data.postbackTitle || data.title,
      },
    };

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
  } else if (eventName.includes('reaction')) {
    events.push({
      type: 'reaction',
      platform,
      data: data as ZernioMessageData,
      accountId,
    });
  }

  return events;
}
