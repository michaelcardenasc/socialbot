import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ZernioCommentData } from '../types/zernio.types.js';
import type { KeywordRule } from '../types/keyword.types.js';

// Mock zernio service
const mockInitiateDM = vi.fn().mockResolvedValue({ conversationId: 'conv1', messageId: 'm1' });
const mockReplyToComment = vi.fn().mockResolvedValue({ id: 'r1', commentId: 'c1' });

vi.mock('../services/zernio.service.js', () => ({
  initiateDM: (...args: unknown[]) => mockInitiateDM(...args),
  replyToComment: (...args: unknown[]) => mockReplyToComment(...args),
  sendTextDM: vi.fn().mockResolvedValue({ id: 'm1', conversationId: 'c1', messageId: 'm1' }),
  getUserProfile: vi.fn().mockResolvedValue({ id: '123', username: 'testuser' }),
}));

vi.mock('../config/env.js', () => ({
  getEnv: () => ({
    ZERNIO_API_KEY: 'test',
    ZERNIO_WEBHOOK_SECRET: 'test',
    ZERNIO_ACCOUNT_ID: 'acc_123',
    PORT: 3000,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ADMIN_API_KEY: 'test',
  }),
}));

import { handleComment } from '../handlers/comment.handler.js';
import { loadKeywordRules } from '../services/keyword.service.js';
import { resetAll } from '../services/cooldown.service.js';

function makeComment(text: string, userId = 'user1', username = 'testuser'): ZernioCommentData {
  return {
    commentId: `comment_${Date.now()}`,
    postId: 'post_123',
    sender: {
      id: userId,
      username,
    },
    text,
  };
}

const testRules: KeywordRule[] = [
  {
    id: 'clase',
    keyword: 'CLASE',
    aliases: [],
    matchType: 'contains',
    priority: 1,
    enabled: true,
    cooldownMinutes: 60,
    response: {
      type: 'button',
      text: 'Hola {{username}}! Aca te dejo el link:',
      buttons: [{ type: 'web_url', title: 'Inscribirme', url: 'https://example.com/clase' }],
    },
  },
  {
    id: 'ai',
    keyword: 'AI',
    aliases: ['IA'],
    matchType: 'word_boundary',
    priority: 4,
    enabled: true,
    cooldownMinutes: 60,
    response: {
      type: 'text',
      text: 'Hola {{username}}! Info sobre AI:',
    },
  },
];

describe('comment.handler', () => {
  const accountId = 'acc_123';

  beforeEach(() => {
    vi.clearAllMocks();
    resetAll();
    const path = join(tmpdir(), `test-keywords-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(testRules));
    loadKeywordRules(path);
  });

  it('sends button DM formatted as text when keyword matches with buttons', async () => {
    await handleComment(makeComment('quiero la CLASE'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledOnce();
    expect(mockInitiateDM).toHaveBeenCalledWith(
      accountId,
      'user1',
      'Hola testuser! Aca te dejo el link:\n\nOpciones:\n- Inscribirme',
    );
    expect(mockReplyToComment).toHaveBeenCalledOnce();
  });

  it('sends text DM when keyword matches without buttons', async () => {
    await handleComment(makeComment('tell me about AI'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledOnce();
    expect(mockInitiateDM).toHaveBeenCalledWith(
      accountId,
      'user1',
      'Hola testuser! Info sobre AI:',
    );
  });

  it('does not send DM when no keyword matches', async () => {
    await handleComment(makeComment('hello world'), accountId);

    expect(mockInitiateDM).not.toHaveBeenCalled();
    expect(mockReplyToComment).not.toHaveBeenCalled();
  });

  it('respects cooldown — does not send duplicate DM', async () => {
    await handleComment(makeComment('CLASE'), accountId);
    await handleComment(makeComment('CLASE'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledOnce();
  });

  it('allows DM to different user even if same keyword', async () => {
    await handleComment(makeComment('CLASE', 'user1', 'user1'), accountId);
    await handleComment(makeComment('CLASE', 'user2', 'user2'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledTimes(2);
  });

  it('renders {{username}} template', async () => {
    await handleComment(makeComment('tell me about AI', 'user1', 'juancadile'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledWith(
      accountId,
      'user1',
      'Hola juancadile! Info sobre AI:',
    );
  });

  it('matches aliases (IA → ai rule)', async () => {
    await handleComment(makeComment('me gusta la IA'), accountId);

    expect(mockInitiateDM).toHaveBeenCalledOnce();
  });
});
