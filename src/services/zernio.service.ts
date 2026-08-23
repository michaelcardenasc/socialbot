import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type {
  ZernioSendMessageResponse,
  ZernioInitiateDMResponse,
  ZernioCommentReplyResponse,
  ZernioUserProfile,
} from '../types/zernio.types.js';

const API_BASE = 'https://zernio.com/api/v1';

/**
 * Common fetch wrapper for Zernio API
 */
async function zernioFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const env = getEnv();
  const apiKey = env.ZERNIO_API_KEY;

  return withRetry<T>(() =>
    fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
    }),
  );
}

/**
 * Send a text-only DM in an existing conversation
 */
export async function sendTextDM(
  conversationId: string,
  text: string,
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  const env = getEnv();
  const targetAccountId = accountId || env.ZERNIO_ACCOUNT_ID;
  logger.debug({ conversationId, accountId: targetAccountId }, 'Sending text DM via Zernio');
  return zernioFetch<ZernioSendMessageResponse>(
    `/inbox/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        accountId: targetAccountId,
        message: text,
      }),
    },
  );
}

/**
 * Send a media DM (generic - picks the right method based on type)
 */
export async function sendMediaDM(
  conversationId: string,
  text: string,
  attachmentUrl: string,
  attachmentType: 'image' | 'video' | 'audio' | 'file',
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  const env = getEnv();
  const targetAccountId = accountId || env.ZERNIO_ACCOUNT_ID;
  logger.debug({ conversationId, attachmentType, accountId: targetAccountId }, 'Sending media DM via Zernio');
  return zernioFetch<ZernioSendMessageResponse>(
    `/inbox/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        accountId: targetAccountId,
        message: text,
        attachmentUrl,
        attachmentType,
      }),
    },
  );
}

/**
 * Send an image DM
 */
export async function sendImageDM(
  conversationId: string,
  text: string,
  imageUrl: string,
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  return sendMediaDM(conversationId, text, imageUrl, 'image', accountId);
}

/**
 * Send an audio DM
 */
export async function sendAudioDM(
  conversationId: string,
  text: string,
  audioUrl: string,
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  return sendMediaDM(conversationId, text, audioUrl, 'audio', accountId);
}

/**
 * Send a video DM
 */
export async function sendVideoDM(
  conversationId: string,
  text: string,
  videoUrl: string,
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  return sendMediaDM(conversationId, text, videoUrl, 'video', accountId);
}

/**
 * Send a file DM
 */
export async function sendFileDM(
  conversationId: string,
  text: string,
  fileUrl: string,
  accountId?: string,
): Promise<ZernioSendMessageResponse> {
  return sendMediaDM(conversationId, text, fileUrl, 'file', accountId);
}

/**
 * Initiate a new DM conversation (e.g., from a comment trigger)
 */
export async function initiateDM(
  accountId: string,
  participantId: string,
  text: string,
  attachment?: { url: string; type: 'image' | 'video' | 'audio' | 'file' },
): Promise<ZernioInitiateDMResponse> {
  return sendTextDM(participantId, text, accountId) as any;
}

/**
 * Reply to a comment publicly
 */
export async function replyToComment(
  accountId: string,
  commentId: string,
  text: string,
): Promise<ZernioCommentReplyResponse> {
  logger.debug({ accountId, commentId }, 'Replying to comment via Zernio');
  return zernioFetch<ZernioCommentReplyResponse>(
    '/inbox/comments/reply',
    {
      method: 'POST',
      body: JSON.stringify({ commentId, accountId, message: text }),
    },
  );
}

/**
 * Get comment author info from Zernio (searches specific post or all posts)
 */
export async function getCommentAuthor(
  accountId: string,
  postId: string,
  commentId: string,
): Promise<{ id: string; username: string; name?: string } | null> {
  // 1. Check specific post if postId provided
  if (postId) {
    try {
      const res = await zernioFetch<{
        status: string;
        comments?: Array<{
          id: string;
          from?: { id: string; username: string; name?: string };
        }>;
      }>(`/inbox/comments/${postId}?accountId=${accountId}`);

      const found = res.comments?.find((c) => c.id === commentId);
      if (found?.from?.id) {
        return {
          id: found.from.id,
          username: found.from.username || 'amigo',
          name: found.from.name,
        };
      }
    } catch {}
  }

  // 2. Fallback: Search all recent posts
  try {
    const listRes = await zernioFetch<{ data?: Array<{ id: string; commentCount: number }> }>(
      `/inbox/comments?accountId=${accountId}`,
    );
    for (const post of listRes.data || []) {
      try {
        const postRes = await zernioFetch<{
          comments?: Array<{
            id: string;
            from?: { id: string; username: string; name?: string };
          }>;
        }>(`/inbox/comments/${post.id}?accountId=${accountId}`);

        const found = postRes.comments?.find((c) => c.id === commentId);
        if (found?.from?.id) {
          return {
            id: found.from.id,
            username: found.from.username || 'amigo',
            name: found.from.name,
          };
        }
      } catch {}
    }
  } catch (err) {
    logger.warn({ err, commentId }, 'Failed to lookup comment author across posts');
  }

  return null;
}

/**
 * Get user profile
 */
export async function getUserProfile(
  accountId: string,
  userId: string,
): Promise<ZernioUserProfile> {
  logger.debug({ accountId, userId }, 'Getting user profile via Zernio');
  return zernioFetch<ZernioUserProfile>(
    `/inbox/contacts/${userId}?accountId=${accountId}`,
    {
      method: 'GET',
    },
  );
}
