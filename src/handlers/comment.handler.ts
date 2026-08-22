import type { ZernioCommentData } from '../types/zernio.types.js';
import { matchKeyword } from '../services/keyword.service.js';
import { isOnCooldown, isRateLimited, recordTrigger } from '../services/cooldown.service.js';
import { initiateDM, sendTextDM, replyToComment } from '../services/zernio.service.js';
import { renderTemplate } from '../utils/templates.js';
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
  const { sender, text, commentId } = comment;
  const userId = sender.id;
  const username = sender.username;

  logger.info({ userId, username, text, commentId, accountId }, 'Processing comment');

  // 1. Match against keyword rules
  const rule = matchKeyword(text);

  if (!rule) {
    logger.debug({ text }, 'No keyword match');
    return;
  }

  logger.info({ ruleId: rule.id, keyword: rule.keyword }, 'Keyword matched');

  // 2. Check rate limit
  if (isRateLimited(userId)) {
    logger.warn({ userId }, 'User rate limited (max DMs/hour)');
    return;
  }

  // 3. Check cooldown
  if (isOnCooldown(userId, rule.id, rule.cooldownMinutes)) {
    logger.info({ userId, ruleId: rule.id }, 'Skipped — user on cooldown');
    return;
  }

  // 4. Upsert lead in DB
  try {
    await upsertLead({
      igUserId: userId,
      igUsername: username,
      source: 'comment',
      keywordId: rule.id,
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to upsert lead (continuing with DM)');
  }

  // 5. Render template
  const vars = { username };
  const renderedText = renderTemplate(rule.response.text, vars);

  // 6. Send DM (initiate from comment)
  try {
    // For now, we only send text DMs since we are using Zernio.
    let textToSend = renderedText;
    if (rule.response.type === 'button' && rule.response.buttons?.length) {
      // Append button options as text instructions for now
      const buttonTexts = rule.response.buttons.map((b) => `- ${b.title}`).join('\n');
      textToSend += '\n\nOpciones:\n' + buttonTexts;
    }

    await initiateDM(accountId, userId, textToSend);

    // Try to reply publicly
    try {
      await replyToComment(accountId, commentId, '¡Revisa tus DMs! 📩');
    } catch (replyErr) {
      logger.error({ replyErr, commentId }, 'Failed to reply to comment');
    }

    // 7. Record trigger & log DM
    recordTrigger(userId, rule.id);
    logDM({
      igUserId: userId,
      direction: 'outbound',
      messageType: rule.response.type,
      keywordId: rule.id,
      content: textToSend,
    }).catch((err) => logger.error({ err }, 'Failed to log DM'));

    logger.info(
      { userId, username, ruleId: rule.id, commentId },
      'DM sent successfully',
    );
  } catch (err) {
    logger.error({ err, userId, ruleId: rule.id }, 'Failed to send DM');
  }
}

export async function sendFollowUp(conversationId: string, rule: ReturnType<typeof matchKeyword>): Promise<void> {
  if (!rule?.followUp) return;

  let textToSend = rule.followUp.text;
  if (rule.followUp.type === 'button' && rule.followUp.buttons?.length) {
    const buttonTexts = rule.followUp.buttons.map((b) => `- ${b.title}`).join('\n');
    textToSend += '\n\nOpciones:\n' + buttonTexts;
  }

  await sendTextDM(conversationId, textToSend);

  // We might not have igUserId directly here easily for logDM unless we change logDM signature or lookup
  // But for the scope of this migration, keeping it simple as we don't have userId. We'll pass conversationId as igUserId for now.
  logDM({
    igUserId: conversationId,
    direction: 'outbound',
    messageType: 'followup',
    keywordId: rule.id,
    content: textToSend,
  }).catch(() => {});
}
