import type { ZernioCommentData } from '../types/zernio.types.js';
import { matchKeyword } from '../services/keyword.service.js';
import { isOnCooldown, isRateLimited, recordTrigger } from '../services/cooldown.service.js';
import { sendTextDM, replyToComment, getCommentAuthor } from '../services/zernio.service.js';
import { executeResponse } from '../services/sequence.service.js';
import { logger } from '../utils/logger.js';
import { upsertLead } from '../services/lead.service.js';
import { logDM } from '../services/dmlog.service.js';

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local.length <= 2 ? '*'.repeat(local.length) : local[0] + '***' + local[local.length - 1];
  return `${masked}@${domain}`;
}

export async function handleComment(comment: ZernioCommentData, accountId: string): Promise<void> {
  let { sender, text, commentId, postId } = comment;
  let userId = sender?.id || '';
  let username = sender?.username || '';

  logger.info({ comment, userId, username, text, commentId, accountId }, '💬 Processing comment');

  // If userId is missing, fetch from Zernio
  if (!userId || userId === 'amigo') {
    logger.info({ commentId, postId }, 'Attempting to lookup commenter author from Zernio API...');
    const author = await getCommentAuthor(accountId, postId, commentId);
    if (author) {
      userId = author.id;
      username = author.username;
      sender = { id: author.id, username: author.username, name: author.name };
      logger.info({ author }, '✅ Resolved commenter author from Zernio API');
    }
  }

  if (!username || username === 'amigo') {
    username = sender.username || 'amigo';
  }

  if (!text || !text.trim()) {
    logger.debug('Empty comment text, skipping');
    return;
  }

  // 1. Match against keyword rules
  const rule = matchKeyword(text);

  if (!rule) {
    logger.debug({ text }, 'No keyword match for comment');
    return;
  }

  logger.info({ ruleId: rule.id, keyword: rule.keyword, username, userId }, '🎯 Keyword matched from comment');

  // 2. Check rate limit
  if (userId && isRateLimited(userId)) {
    logger.warn({ userId }, 'User rate limited (max DMs/hour)');
    return;
  }

  // 3. Check cooldown
  if (userId && isOnCooldown(userId, rule.id, rule.cooldownMinutes)) {
    logger.info({ userId, ruleId: rule.id }, 'Skipped — user on cooldown');
    return;
  }

  // 4. Reply publicly to comment first
  if (commentId) {
    const publicReply = rule.commentReply || '¡Hola! Te envié un mensaje directo 📩';
    try {
      await replyToComment(accountId, commentId, publicReply);
      logger.info({ commentId, reply: publicReply }, 'Public comment reply sent');
    } catch (replyErr) {
      logger.error({ replyErr, commentId }, 'Failed to reply publicly to comment');
    }
  }

  // 5. Send DM response (supports text, media, sequence, menu)
  if (!userId || userId === 'amigo') {
    logger.warn({ comment }, 'Cannot send DM: unable to identify commenter user ID');
    return;
  }

  const vars = {
    username,
    name: sender.name || username,
  };

  try {
    // Upsert lead in DB
    await upsertLead({
      igUserId: userId,
      igUsername: username,
      source: 'comment',
      keywordId: rule.id,
      conversationId: userId,
    });

    // Send full response / sequence to the user via DM
    await executeResponse(userId, rule.response, vars, {
      keywordId: rule.id,
      igUserId: userId,
      accountId,
    });

    // Record trigger
    recordTrigger(userId, rule.id);

    logger.info(
      { userId, username, ruleId: rule.id, commentId },
      '✅ Comment handled and DM sent successfully',
    );
  } catch (err) {
    logger.error({ err, userId, ruleId: rule.id }, 'Failed to send DM for comment');
  }
}

export async function sendFollowUp(conversationId: string, rule: ReturnType<typeof matchKeyword>): Promise<void> {
  if (!rule?.followUp) return;

  const textToSend = rule.followUp.text;
  await sendTextDM(conversationId, textToSend);

  logDM({
    igUserId: conversationId,
    direction: 'outbound',
    messageType: 'followup',
    keywordId: rule.id,
    content: textToSend,
  }).catch(() => {});
}
