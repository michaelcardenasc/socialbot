import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { KeywordRule } from '../types/keyword.types.js';
import { logger } from '../utils/logger.js';
import { getDb } from './db.js';

let rules: KeywordRule[] = [];

/** Load keyword rules from DB; fall back to keywords.json on error */
export async function loadKeywordRulesFromDb(): Promise<KeywordRule[]> {
  try {
    const db = getDb();
    const rows = await db<{
      id: string; keyword: string; aliases: string[]; match_type: string;
      priority: number; enabled: boolean; cooldown_minutes: number;
      ask_email: boolean; platforms: string[]; comment_reply: string | null;
      response: unknown; follow_up: unknown | null;
    }[]>`
      SELECT * FROM keyword_rules WHERE enabled = true ORDER BY priority ASC
    `;

    if (rows.length === 0) {
      logger.info('No keyword rules in DB, falling back to keywords.json');
      return loadKeywordRules();
    }

    rules = rows.map((r) => ({
      id: r.id,
      keyword: r.keyword,
      aliases: r.aliases || [],
      matchType: r.match_type as KeywordRule['matchType'],
      priority: r.priority,
      enabled: r.enabled,
      cooldownMinutes: r.cooldown_minutes,
      askEmail: r.ask_email,
      platforms: r.platforms || ['instagram', 'facebook'],
      commentReply: r.comment_reply ?? undefined,
      response: r.response as KeywordRule['response'],
      followUp: r.follow_up as KeywordRule['followUp'] ?? undefined,
    }));

    logger.info({ count: rules.length }, 'Loaded keyword rules from DB');
    return rules;
  } catch (err) {
    logger.warn({ err }, 'Failed to load keywords from DB, using keywords.json');
    return loadKeywordRules();
  }
}

export function loadKeywordRules(filePath?: string): KeywordRule[] {
  const path = filePath ?? resolve(process.cwd(), 'keywords.json');
  const raw = readFileSync(path, 'utf-8');
  const parsed: KeywordRule[] = JSON.parse(raw);

  rules = parsed
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  logger.info({ count: rules.length }, 'Loaded keyword rules from file');
  return rules;
}

export function getKeywordRules(): KeywordRule[] {
  return rules;
}

export function setKeywordRules(newRules: KeywordRule[]): void {
  rules = newRules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
}

export function matchKeyword(commentText: string): KeywordRule | null {
  const text = (commentText || '').trim();

  for (const rule of rules) {
    const keywords = [rule.keyword, ...rule.aliases];
    for (const kw of keywords) {
      if (isMatch(text, kw, rule.matchType)) {
        return rule;
      }
    }
  }

  return null;
}

function isMatch(text: string, keyword: string, matchType: KeywordRule['matchType']): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  switch (matchType) {
    case 'exact':
      return lowerText === lowerKeyword;
    case 'contains':
      return lowerText.includes(lowerKeyword);
    case 'word_boundary': {
      const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(text);
    }
  }
}
