import type {
  ParsedZernioEvent,
  ZernioCommentData,
  ZernioMessageData,
} from '../types/zernio.types.js';
import { logger } from '../utils/logger.js';

export type { ParsedZernioEvent };

export function parseWebhookPayload(payload: any): ParsedZernioEvent[] {
  const events: ParsedZernioEvent[] = [];
  if (!payload) return events;

  const eventName = (payload.event || payload.type || '').toLowerCase();
  const platform = payload.platform || payload.conversation?.platform || 'instagram';
  const accountId =
    payload.accountId ||
    payload.account?.id ||
    payload.account_id ||
    payload.conversation?.accountId ||
    '';

  logger.info({ eventName, platform, accountId }, '🔍 Parsing webhook event');

  // ── COMMENT events ──────────────────────────────────────────────────────────
  if (eventName.includes('comment')) {
    const d = payload.data || payload.comment || payload;
    const sender = {
      id: d.sender?.id || d.from?.id || d.user_id || d.participantId || d.userId || payload.from?.id || payload.sender?.id || '',
      username: d.sender?.username || d.from?.username || d.participantUsername || d.username || payload.from?.username || payload.sender?.username || 'amigo',
      name: d.sender?.name || d.from?.name || d.participantName || d.name || payload.from?.name || payload.sender?.name,
    };
    const commentId = d.commentId || d.comment_id || d.id || payload.id || '';
    const postId = d.postId || d.post_id || d.media_id || payload.postId || '';
    const text = typeof d.text === 'string' ? d.text : (typeof d.message === 'string' ? d.message : (typeof payload.message === 'string' ? payload.message : (typeof payload.text === 'string' ? payload.text : (d.content || ''))));

    const commentData: ZernioCommentData = {
      commentId,
      postId,
      sender,
      text,
      parentCommentId: d.parentCommentId || d.parent_id,
    };
    events.push({ type: 'comment', platform, data: commentData, accountId });
    return events;
  }

  // ── CONVERSATION.STARTED (new DM initiated by a user) ───────────────────────
  if (eventName === 'conversation.started' || (eventName.includes('conversation') && !eventName.includes('message'))) {
    const conv = payload.conversation || payload.data || payload;
    const sender = {
      id: conv.participantId || conv.participant_id || conv.sender?.id || '',
      username: conv.participantUsername || conv.participant_username || conv.sender?.username || 'amigo',
      name: conv.participantName || conv.participant_name || conv.sender?.name,
    };
    const conversationId = conv.platformConversationId || conv.id || conv.conversationId || sender.id;

    // Deduplicate — Zernio sometimes fires conversation.started multiple times
    const dedupeKey = `conv_started_${sender.id}`;
    if ((global as any).__recentConversations === undefined) (global as any).__recentConversations = new Map();
    const recent = (global as any).__recentConversations as Map<string, number>;
    const lastSeen = recent.get(dedupeKey) || 0;
    const now = Date.now();
    if (now - lastSeen < 10_000) {
      logger.info({ senderId: sender.id }, '⏭️ Skipping duplicate conversation.started (within 10s)');
      return events;
    }
    recent.set(dedupeKey, now);
    // Clean up old entries
    if (recent.size > 500) recent.clear();

    const messageData: ZernioMessageData = {
      conversationId,
      messageId: payload.id || payload.eventId || '',
      sender,
      text: payload.msg || payload.message || payload.text || payload.lastMessage || 'hola',
      attachments: [],
      metadata: {},
    };
    events.push({ type: 'message', platform, data: messageData, accountId });
    return events;
  }

  // ── MESSAGE.RECEIVED (reply in existing thread) ──────────────────────────────
  if (eventName.includes('message')) {
    const d = payload.data || payload.message || payload;
    const postbackPayload = d.metadata?.postbackPayload || d.postbackPayload || d.payload;

    const messageData: ZernioMessageData = {
      conversationId: d.conversationId || d.conversation_id || d.threadId || d.sender?.id || '',
      messageId: d.messageId || d.message_id || d.id || '',
      sender: {
        id: d.sender?.id || d.from?.id || d.participantId || d.user_id || '',
        username: d.sender?.username || d.from?.username || d.participantUsername || d.username || 'amigo',
        name: d.sender?.name || d.from?.name || d.participantName || d.name,
      },
      text: typeof d.text === 'string' ? d.text : (typeof d.message === 'string' ? d.message : (d.content || '')),
      attachments: d.attachments || [],
      metadata: d.metadata || { postbackPayload, postbackTitle: d.postbackTitle },
    };

    if (postbackPayload) {
      events.push({ type: 'postback', platform, data: messageData, accountId });
    } else {
      events.push({ type: 'message', platform, data: messageData, accountId });
    }
    return events;
  }

  // ── REACTION events ──────────────────────────────────────────────────────────
  if (eventName.includes('reaction')) {
    const d = payload.data || payload;
    events.push({ type: 'reaction', platform, data: d as ZernioMessageData, accountId });
  }

  return events;
}
