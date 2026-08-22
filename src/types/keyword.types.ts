export interface MessageButton {
  type: 'web_url' | 'postback';
  title: string;
  url?: string;
  payload?: string;
}

export interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url: string;
  caption?: string;
}

export interface SequenceStep {
  delay?: number;        // seconds to wait before sending this step
  text?: string;
  media?: MediaAttachment;
  buttons?: MessageButton[];
}

export interface KeywordResponse {
  type: 'text' | 'button' | 'media' | 'sequence';
  text: string;
  buttons?: MessageButton[];
  media?: MediaAttachment[];    // Direct media attachments
  sequence?: SequenceStep[];     // Multi-step message sequence
}

export interface KeywordRule {
  id: string;
  keyword: string;
  aliases: string[];
  matchType: 'exact' | 'contains' | 'word_boundary';
  priority: number;
  enabled: boolean;
  cooldownMinutes: number;
  askEmail?: boolean;
  platforms?: string[];           // Which platforms this rule applies to
  commentReply?: string;          // Optional public reply to the comment
  response: KeywordResponse;
  followUp?: KeywordResponse;
}
