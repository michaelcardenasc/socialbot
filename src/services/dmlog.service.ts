import { getDb } from './db.js';

export async function logDM(data: {
  igUserId: string;
  direction: 'inbound' | 'outbound';
  messageType?: string;
  keywordId?: string;
  content?: string;
  platform?: string;
  conversationId?: string;
}): Promise<void> {
  const db = getDb();
  const platform = data.platform ?? 'instagram';
  await db`
    INSERT INTO dm_log (ig_user_id, direction, message_type, keyword_id, content, platform, conversation_id)
    VALUES (${data.igUserId}, ${data.direction}, ${data.messageType ?? null}, ${data.keywordId ?? null}, ${data.content ?? null}, ${platform}, ${data.conversationId ?? null})
  `;
}
