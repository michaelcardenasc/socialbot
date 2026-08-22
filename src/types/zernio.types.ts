// Webhook event payload from Zernio
export interface ZernioWebhookPayload {
  eventId: string;
  event: ZernioEventType;
  timestamp: string;
  accountId: string;
  platform: 'instagram' | 'facebook' | 'tiktok' | 'whatsapp';
  profileId: string;
  data: ZernioMessageData | ZernioCommentData;
}

export type ZernioEventType = 'message.received' | 'comment.received' | 'comment.created' | 'reaction.received' | 'post.published' | 'post.failed' | 'account.connected' | 'account.disconnected';

export interface ZernioSender {
  id: string;
  username: string;
  name?: string;
}

export interface ZernioMessageData {
  conversationId: string;
  messageId: string;
  sender: ZernioSender;
  text: string;
  attachments: ZernioAttachment[];
  metadata?: {
    quotedMessageId?: string | null;
    postbackPayload?: string;  // For button click payloads
    postbackTitle?: string;
  };
}

export interface ZernioCommentData {
  commentId: string;
  postId: string;
  sender: ZernioSender;
  text: string;
  parentCommentId?: string;
}

export interface ZernioAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  mimeType?: string;
  size?: number;
}

// API response types
export interface ZernioSendMessageResponse {
  id: string;
  conversationId: string;
  messageId: string;
}

export interface ZernioSendMessageRequest {
  message?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}

export interface ZernioInitiateDMRequest {
  accountId: string;
  participantId: string;
  message?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
}

export interface ZernioInitiateDMResponse {
  conversationId: string;
  messageId: string;
}

export interface ZernioCommentReplyResponse {
  id: string;
  commentId: string;
}

export interface ZernioUserProfile {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
}

export interface ZernioCommentAutomation {
  id: string;
  accountId: string;
  trigger: 'comment' | 'story_reply';
  matchMode: 'exact' | 'contains';
  keywords: string[];
  dmMessage: string;
  commentReply?: string;
  isActive: boolean;
  deduplicate: boolean;
}

// Parsed event union (used internally by our parser)
export type ParsedZernioEvent =
  | { type: 'comment'; platform: string; data: ZernioCommentData; accountId: string }
  | { type: 'message'; platform: string; data: ZernioMessageData; accountId: string }
  | { type: 'postback'; platform: string; data: ZernioMessageData; accountId: string }
  | { type: 'reaction'; platform: string; data: ZernioMessageData; accountId: string };
