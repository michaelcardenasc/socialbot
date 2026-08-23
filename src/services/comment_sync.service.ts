import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { matchKeyword } from './keyword.service.js';
import { executeResponse } from './sequence.service.js';
import { replyToComment } from './zernio.service.js';
import { upsertLead } from './lead.service.js';
import { logDM } from './dmlog.service.js';

const processedCommentIds = new Set<string>();

/**
 * Polls Zernio inbox comments every 15 seconds to ensure NO comment is ever missed
 * even if Zernio's webhook drops or delays the event.
 */
export function startCommentSync(): void {
  logger.info('🚀 Starting automated Comment Sync Worker (every 15s)');

  // Run initial sync after 3s
  setTimeout(() => {
    syncNewComments().catch((err) => logger.error({ err }, 'Error in initial comment sync'));
  }, 3000);

  // Poll every 15 seconds
  setInterval(() => {
    syncNewComments().catch((err) => logger.error({ err }, 'Error in periodic comment sync'));
  }, 15000);
}

export async function syncNewComments(): Promise<void> {
  const env = getEnv();
  const accountId = env.ZERNIO_ACCOUNT_ID;
  const apiKey = env.ZERNIO_API_KEY;

  if (!accountId || !apiKey) return;

  try {
    // 1. Fetch recent posts
    const res = await fetch(`https://zernio.com/api/v1/inbox/comments?accountId=${accountId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) return;

    const data = (await res.json()) as { data?: Array<{ id: string; commentCount: number }> };
    const posts = data.data || [];

    for (const post of posts) {
      if (!post.commentCount || post.commentCount <= 0) continue;

      // 2. Fetch comments for this post
      const cRes = await fetch(`https://zernio.com/api/v1/inbox/comments/${post.id}?accountId=${accountId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!cRes.ok) continue;

      const cData = (await cRes.json()) as {
        comments?: Array<{
          id: string;
          message: string;
          from?: { id: string; username: string; name?: string; isOwner?: boolean };
          replies?: unknown[];
          canReply?: boolean;
        }>;
      };

      const comments = cData.comments || [];

      for (const comment of comments) {
        // Skip if already processed in this runtime or if author is the page owner
        if (processedCommentIds.has(comment.id)) continue;
        if (comment.from?.isOwner) {
          processedCommentIds.add(comment.id);
          continue;
        }

        // Check if comment already has replies
        if (comment.replies && comment.replies.length > 0) {
          processedCommentIds.add(comment.id);
          continue;
        }

        const text = comment.message?.trim() || '';
        const rule = matchKeyword(text);

        if (!rule) {
          processedCommentIds.add(comment.id);
          continue;
        }

        const userId = comment.from?.id;
        const username = comment.from?.username || 'amigo';

        if (!userId) {
          continue;
        }

        logger.info(
          { commentId: comment.id, username, userId, keyword: rule.keyword },
          '⚡ Comment Sync Worker detected unhandled comment — processing now',
        );

        processedCommentIds.add(comment.id);

        // 1. Public reply
        if (rule.commentReply || true) {
          const publicReply = rule.commentReply || '¡Hola! Te envié un mensaje directo 📩';
          try {
            await replyToComment(accountId, comment.id, publicReply);
            logger.info({ commentId: comment.id }, 'Sync Worker: public reply posted');
          } catch (err) {
            logger.error({ err, commentId: comment.id }, 'Sync Worker: failed public reply');
          }
        }

        // 2. Upsert Lead
        try {
          await upsertLead({
            igUserId: userId,
            igUsername: username,
            source: 'comment',
            keywordId: rule.id,
            conversationId: userId,
          });
        } catch {}

        // 3. Send DM Response
        const vars = {
          username,
          name: comment.from?.name || username,
        };

        try {
          await executeResponse(userId, rule.response, vars, {
            keywordId: rule.id,
            igUserId: userId,
            accountId,
          });
          logger.info({ userId, username, ruleId: rule.id }, 'Sync Worker: DM sent successfully');
        } catch (err) {
          logger.error({ err, userId }, 'Sync Worker: failed to send DM');
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Comment sync cycle error');
  }
}
