import type { ZernioMessageData } from '../types/zernio.types.js';
import { logger } from '../utils/logger.js';
import { getLeadByIgUserId, setLeadEmail, setLeadStatus, upsertLead } from '../services/lead.service.js';
import { logDM } from '../services/dmlog.service.js';
import { sendTextDM, getUserProfile } from '../services/zernio.service.js';
import { sendWelcomeEmail, sendResourceEmail } from '../services/email.service.js';
import { getKeywordRules, matchKeyword } from '../services/keyword.service.js';
import { isOnCooldown, isRateLimited, recordTrigger } from '../services/cooldown.service.js';
import { renderTemplate } from '../utils/templates.js';
import { getEnv } from '../config/env.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleMessage(event: ZernioMessageData, accountId: string): Promise<void> {
  const senderId = event.sender.id;
  const text = event.text?.trim();
  const conversationId = event.conversationId;
  const mid = event.messageId;

  logger.info({ senderId, conversationId, text, mid, accountId }, 'Received DM');

  // Log inbound message
  logDM({
    igUserId: senderId,
    direction: 'inbound',
    messageType: 'text',
    content: text,
  }).catch((err) => logger.error({ err }, 'Failed to log inbound DM'));

  if (!text) return;

  try {
    const lead = await getLeadByIgUserId(senderId);

    // 1. Email collection flow — but if text matches a keyword, handle as keyword instead
    if (lead && (lead.status === 'email_pending' || lead.status === 'email_confirming' || lead.status === 'email_reminded')) {
      const keywordMatch = matchKeyword(text);
      if (keywordMatch) {
        await handleKeywordDM(event, accountId, keywordMatch, lead);
        return;
      }
      await handleEmailCollection(event, accountId, text, lead);
      return;
    }

    // 2. Keyword matching (ice breakers, manual keyword DMs)
    const rule = matchKeyword(text);
    if (rule) {
      await handleKeywordDM(event, accountId, rule, lead);
      return;
    }

    // 3. No keyword match — do nothing. This is a normal conversation with the human.
    logger.debug({ senderId, text }, 'No keyword match, ignoring message');
  } catch (err) {
    logger.error({ err, senderId }, 'Error handling message');
  }
}

async function handleEmailCollection(
  event: ZernioMessageData,
  accountId: string,
  text: string,
  lead: NonNullable<Awaited<ReturnType<typeof getLeadByIgUserId>>>,
): Promise<void> {
  const senderId = event.sender.id;
  const conversationId = event.conversationId;

  if (EMAIL_REGEX.test(text)) {
    // Valid email — save it
    await setLeadEmail(senderId, text);

    // Send the followUp resource for their keyword
    const rule = getKeywordRules().find((r) => r.id === lead.keyword_id);

    if (rule?.followUp) {
      let textToSend = rule.followUp.text;
      if (rule.followUp.type === 'button' && rule.followUp.buttons?.length) {
        const buttonTexts = rule.followUp.buttons.map((b) => `- ${b.title}`).join('\n');
        textToSend += '\n\nOpciones:\n' + buttonTexts;
      }
      await sendTextDM(conversationId, textToSend);

      logDM({
        igUserId: senderId,
        direction: 'outbound',
        messageType: 'followup',
        keywordId: rule.id,
        content: textToSend,
      }).catch(() => {});
    } else {
      await sendTextDM(conversationId, 'Genial, ya quedo guardado tu email! Te vamos a enviar info pronto.');
    }

    // Send emails if Resend is configured
    const env = getEnv();
    if (env.RESEND_API_KEY) {
      const username = lead.ig_username ?? 'amigo';
      try {
        if (rule?.followUp?.buttons?.[0]?.url) {
          await sendResourceEmail(text, username, rule.followUp.buttons[0].title, rule.followUp.buttons[0].url);
        } else if (rule?.followUp?.text) {
          await sendResourceEmail(text, username, 'Tu recurso', rule.followUp.text);
        }
        await sendWelcomeEmail(text, username);
        await setLeadStatus(senderId, 'email_sent');
      } catch (err) {
        logger.error({ err, email: text }, 'Failed to send emails');
      }
    }

    logger.info({ senderId, email: text, keywordId: lead.keyword_id }, 'Email collected, followUp sent');
  } else {
    // Not a valid email — ask again
    await sendTextDM(conversationId, 'Hmm, no parece un email valido. Podes enviarmelo de nuevo?');
  }
}

async function handleKeywordDM(
  event: ZernioMessageData,
  accountId: string,
  rule: NonNullable<ReturnType<typeof matchKeyword>>,
  existingLead: Awaited<ReturnType<typeof getLeadByIgUserId>>,
): Promise<void> {
  const senderId = event.sender.id;
  const conversationId = event.conversationId;

  // Rate limit & cooldown checks
  if (isRateLimited(senderId)) {
    logger.warn({ senderId }, 'User rate limited (max DMs/hour)');
    return;
  }
  if (isOnCooldown(senderId, rule.id, rule.cooldownMinutes)) {
    logger.info({ senderId, ruleId: rule.id }, 'Skipped — user on cooldown');
    return;
  }

  // Get username
  let username = existingLead?.ig_username;
  if (!username) {
    try {
      const profile = await getUserProfile(accountId, senderId);
      username = profile.username;
    } catch {
      username = event.sender.username || 'amigo';
    }
  }

  // Upsert lead
  try {
    await upsertLead({
      igUserId: senderId,
      igUsername: username,
      source: 'dm',
      keywordId: rule.id,
    });
  } catch (err) {
    logger.error({ err, senderId }, 'Failed to upsert lead (continuing with DM)');
  }

  // Send keyword response
  let textToSend = renderTemplate(rule.response.text, { username });
  if (rule.response.type === 'button' && rule.response.buttons?.length) {
    const buttonTexts = rule.response.buttons.map((b) => `- ${b.title}`).join('\n');
    textToSend += '\n\nOpciones:\n' + buttonTexts;
  }
  await sendTextDM(conversationId, textToSend);

  // Record trigger & log
  recordTrigger(senderId, rule.id);
  logDM({
    igUserId: senderId,
    direction: 'outbound',
    messageType: rule.response.type,
    keywordId: rule.id,
    content: textToSend,
  }).catch((err) => logger.error({ err }, 'Failed to log DM'));

  logger.info({ senderId, ruleId: rule.id }, 'Keyword DM sent successfully');
}
