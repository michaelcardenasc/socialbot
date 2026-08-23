import type { SequenceStep, KeywordResponse, MessageButton } from '../types/keyword.types.js';
import { sendTextDM, sendMediaDM } from './zernio.service.js';
import { renderTemplate } from '../utils/templates.js';
import { logDM } from './dmlog.service.js';
import { logger } from '../utils/logger.js';

function wait(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function formatButtonsAsText(buttons: MessageButton[]): string {
  return buttons.map((b) => {
    if (b.type === 'web_url' && b.url) {
      return `🔘 ${b.title}: ${b.url}`;
    }
    return `🔘 ${b.title}`;
  }).join('\n');
}

/**
 * Executes a multi-step message sequence with configurable delays.
 */
export async function executeSequence(
  conversationId: string,
  rawSteps: SequenceStep[],
  vars: Record<string, string>,
  options?: { keywordId?: string; igUserId?: string; accountId?: string },
): Promise<void> {
  const keywordId = options?.keywordId;
  const igUserId = options?.igUserId ?? conversationId;
  const accountId = options?.accountId;

  const steps: SequenceStep[] = typeof rawSteps === 'string' ? JSON.parse(rawSteps) : rawSteps;

  if (!steps || !Array.isArray(steps)) {
    logger.warn({ steps, conversationId }, 'Invalid sequence steps format');
    return;
  }

  logger.info({ conversationId, steps: steps.length, keywordId, accountId }, 'Executing sequence');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.delay && step.delay > 0) {
      await wait(step.delay);
    }

    try {
      if (step.media) {
        const text = step.text
          ? renderTemplate(step.text, vars)
          : (step.media.caption ? renderTemplate(step.media.caption, vars) : '');
        await sendMediaDM(conversationId, text, step.media.url, step.media.type, accountId);
        logDM({
          igUserId,
          direction: 'outbound',
          messageType: `media_${step.media.type}`,
          keywordId,
          content: text,
          conversationId,
        }).catch(() => {});
      } else if (step.text) {
        let textToSend = renderTemplate(step.text, vars);
        if (step.buttons && step.buttons.length > 0) {
          textToSend += '\n\n' + formatButtonsAsText(step.buttons);
        }
        await sendTextDM(conversationId, textToSend, accountId);
        logDM({
          igUserId,
          direction: 'outbound',
          messageType: 'text',
          keywordId,
          content: textToSend,
          conversationId,
        }).catch(() => {});
      } else if (step.buttons && step.buttons.length > 0) {
        const textToSend = formatButtonsAsText(step.buttons);
        await sendTextDM(conversationId, textToSend, accountId);
        logDM({
          igUserId,
          direction: 'outbound',
          messageType: 'buttons',
          keywordId,
          content: textToSend,
          conversationId,
        }).catch(() => {});
      }

      logger.debug({ conversationId, stepIndex: i }, 'Sequence step executed');
    } catch (error) {
      logger.error({ error, conversationId, stepIndex: i }, 'Error executing sequence step');
      break;
    }
  }
}

/**
 * Executes a keyword response, routing to the appropriate DM action.
 */
export async function executeResponse(
  conversationId: string,
  rawResponse: KeywordResponse,
  vars: Record<string, string>,
  options?: { keywordId?: string; igUserId?: string; accountId?: string },
): Promise<void> {
  const keywordId = options?.keywordId;
  const igUserId = options?.igUserId ?? conversationId;
  const accountId = options?.accountId;

  const response: KeywordResponse = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;

  if (!response || !response.type) {
    logger.warn({ rawResponse, conversationId }, 'Invalid response format in executeResponse');
    return;
  }

  logger.info({ conversationId, type: response.type, keywordId, accountId }, 'Executing response');

  try {
    switch (response.type) {
      case 'text': {
        const text = renderTemplate(response.text, vars);
        await sendTextDM(conversationId, text, accountId);
        logDM({
          igUserId,
          direction: 'outbound',
          messageType: 'text',
          keywordId,
          content: text,
          conversationId,
        }).catch(() => {});
        break;
      }
      case 'button': {
        let text = renderTemplate(response.text, vars);
        if (response.buttons && response.buttons.length > 0) {
          text += '\n\n' + formatButtonsAsText(response.buttons);
        }
        await sendTextDM(conversationId, text, accountId);
        logDM({
          igUserId,
          direction: 'outbound',
          messageType: 'button',
          keywordId,
          content: text,
          conversationId,
        }).catch(() => {});
        break;
      }
      case 'media': {
        if (response.media && response.media.length > 0) {
          for (const media of response.media) {
            const text = response.text
              ? renderTemplate(response.text, vars)
              : (media.caption ? renderTemplate(media.caption, vars) : '');
            await sendMediaDM(conversationId, text, media.url, media.type, accountId);
            logDM({
              igUserId,
              direction: 'outbound',
              messageType: `media_${media.type}`,
              keywordId,
              content: text,
              conversationId,
            }).catch(() => {});
          }
        }
        break;
      }
      case 'sequence': {
        if (response.sequence && response.sequence.length > 0) {
          await executeSequence(conversationId, response.sequence, vars, { keywordId, igUserId, accountId });
        }
        break;
      }
      default: {
        logger.warn({ type: (response as any).type }, 'Unknown keyword response type');
      }
    }
  } catch (error) {
    logger.error({ error, conversationId, type: response.type }, 'Error executing response');
    throw error;
  }
}
