import { logger } from '../utils/logger.js';
import { getLeadsPendingEmailReminder, setLeadStatus } from './lead.service.js';
import { sendTextDM } from './zernio.service.js';
import { logDM } from './dmlog.service.js';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startEmailReminder(): void {
  // Check every minute for leads that need a reminder
  intervalId = setInterval(async () => {
    try {
      const leads = await getLeadsPendingEmailReminder();

      for (const lead of leads) {
        if (!lead.conversation_id) continue;
        try {
          await sendTextDM(
            lead.conversation_id,
            'Ups! Parece que te ocupaste y olvidaste ingresar tu correo electronico.',
          );
          await sendTextDM(
            lead.conversation_id,
            'Puedo enviarte el link de registro? Ingresa tu correo electronico abajo!',
          );
          await setLeadStatus(lead.ig_user_id, 'email_reminded');

          logDM({
            igUserId: lead.ig_user_id,
            direction: 'outbound',
            messageType: 'reminder',
            content: 'Email reminder',
            platform: lead.platform,
            conversationId: lead.conversation_id
          }).catch(() => {});

          logger.info({ igUserId: lead.ig_user_id }, 'Email reminder sent');
        } catch (err) {
          logger.error({ err, igUserId: lead.ig_user_id }, 'Failed to send email reminder');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in email reminder check');
    }
  }, 60_000);

  logger.info('Email reminder service started (checks every 60s)');
}

export function stopEmailReminder(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
