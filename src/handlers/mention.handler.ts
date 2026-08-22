import { logger } from '../utils/logger.js';
import { initiateDM } from '../services/zernio.service.js';
import { getEnv } from '../config/env.js';
import { logDM } from '../services/dmlog.service.js';

export async function handleMention(mentionData: any, accountId: string): Promise<void> {
  // Since Zernio mention structure is not fully defined yet, using a generic any
  const mediaId = mentionData.mediaId || mentionData.media_id;
  const senderId = mentionData.sender?.id || mentionData.userId;
  const username = mentionData.sender?.username;
  
  logger.info({ mediaId, senderId, accountId }, 'Received story mention');

  try {
    if (!senderId) {
      logger.warn('Could not identify sender for mention');
      return;
    }

    // Don't DM ourselves
    const env = getEnv();
    if (senderId === env.ZERNIO_ACCOUNT_ID) {
      logger.debug('Ignoring self-mention');
      return;
    }

    await initiateDM(
      accountId,
      senderId,
      'Hola! Gracias por mencionarnos en tu historia! Si necesitas algo, escribinos por aca.',
    );

    logDM({
      igUserId: senderId,
      direction: 'outbound',
      messageType: 'mention_reply',
      content: 'Story mention reply',
    }).catch(() => {});

    logger.info({ userId: senderId, username, mediaId }, 'Story mention reply sent');
  } catch (err) {
    logger.error({ err, mediaId }, 'Error handling story mention');
  }
}
