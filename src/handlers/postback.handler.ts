import type { ZernioMessageData } from '../types/zernio.types.js';
import { logger } from '../utils/logger.js';
import { getLeadByIgUserId, setLeadStatus } from '../services/lead.service.js';
import { getKeywordRules } from '../services/keyword.service.js';
import { sendFollowUp, maskEmail } from './comment.handler.js';
import { sendTextDM } from '../services/zernio.service.js';
import { sendResourceEmail, sendWelcomeEmail } from '../services/email.service.js';
import { getEnv } from '../config/env.js';

export async function handlePostback(event: ZernioMessageData, accountId: string): Promise<void> {
  const senderId = event.sender.id;
  const conversationId = event.conversationId;
  const payload = event.metadata?.postbackPayload;
  const title = event.metadata?.postbackTitle;

  logger.info({ senderId, conversationId, title, payload, accountId }, 'Received postback');

  if (!payload) return;

  if (payload.startsWith('start_email:')) {
    await handleStartEmail(senderId, conversationId, payload.replace('start_email:', ''));
  } else if (payload.startsWith('confirm_email:')) {
    await handleConfirmEmail(senderId, conversationId, payload.replace('confirm_email:', ''));
  } else if (payload.startsWith('change_email:')) {
    await handleChangeEmail(senderId, conversationId, payload.replace('change_email:', ''));
  }
}

async function handleStartEmail(senderId: string, conversationId: string, keywordId: string): Promise<void> {
  try {
    const lead = await getLeadByIgUserId(senderId);

    if (lead?.email) {
      // Returning user — confirm/change flow
      const masked = maskEmail(lead.email);
      const textToSend = `Tengo tu email ${masked}. Te mando el link ahi?\n\nOpciones:\n👉 Envía "confirm_email:${keywordId}" para sí\n👉 Envía "change_email:${keywordId}" para cambiarlo`;
      await sendTextDM(conversationId, textToSend);
      await setLeadStatus(senderId, 'email_confirming');
    } else {
      // New user — excitement + ask for email
      await sendTextDM(
        conversationId,
        'GENIAL! No puedo esperar a que empieces a explorar todo lo que Golem tiene para ti.',
      );
      await sendTextDM(
        conversationId,
        'Para que pueda enviarte el link, cual es tu direccion de correo electronico?',
      );
      await setLeadStatus(senderId, 'email_pending');
    }

    logger.info({ senderId, keywordId }, 'Start email flow initiated');
  } catch (err) {
    logger.error({ err, senderId }, 'Error handling start email postback');
  }
}

async function handleConfirmEmail(senderId: string, conversationId: string, keywordId: string): Promise<void> {
  try {
    const lead = await getLeadByIgUserId(senderId);
    if (!lead?.email) {
      logger.warn({ senderId }, 'Postback confirm but no email on file');
      return;
    }

    const rule = getKeywordRules().find((r) => r.id === keywordId) ?? null;

    // Send followUp DM with the resource
    if (rule) {
      await sendFollowUp(conversationId, rule);
    }

    // Send resource + welcome email
    const env = getEnv();
    if (env.RESEND_API_KEY) {
      const username = lead.ig_username ?? 'amigo';
      try {
        if (rule?.followUp?.buttons?.[0]?.url) {
          await sendResourceEmail(lead.email, username, rule.followUp.buttons[0].title, rule.followUp.buttons[0].url);
        }
        await sendWelcomeEmail(lead.email, username);
      } catch (err) {
        logger.error({ err }, 'Failed to send emails after confirm');
      }
    }

    await setLeadStatus(senderId, 'email_sent');
    logger.info({ senderId, keywordId, email: lead.email }, 'Email confirmed, followUp sent');
  } catch (err) {
    logger.error({ err, senderId }, 'Error handling confirm postback');
  }
}

async function handleChangeEmail(senderId: string, conversationId: string, keywordId: string): Promise<void> {
  try {
    await sendTextDM(conversationId, 'Ok! Mandame tu mejor email y te lo actualizo.');
    await setLeadStatus(senderId, 'email_pending');
    logger.info({ senderId, keywordId }, 'User wants to change email');
  } catch (err) {
    logger.error({ err, senderId }, 'Error handling change email postback');
  }
}
