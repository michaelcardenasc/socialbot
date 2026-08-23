import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminAuth, setAdminCookie } from './auth.js';
import { getDb } from '../services/db.js';
import { getKeywordRules, setKeywordRules } from '../services/keyword.service.js';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { KeywordRule } from '../types/keyword.types.js';

export const adminRouter = Router();

// ─── Login ────────────────────────────────────────────────────────────────────
adminRouter.post('/login', (req: Request, res: Response) => {
  const { key } = req.body as { key?: string };
  const env = getEnv();

  if (!key || key !== env.ADMIN_API_KEY) {
    res.status(401).json({ success: false, message: 'Clave incorrecta' });
    return;
  }

  setAdminCookie(res, key);
  res.json({ success: true });
});

adminRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('adminKey');
  res.json({ success: true });
});

// ─── All routes below require auth ────────────────────────────────────────────

// Stats
adminRouter.get('/api/stats', adminAuth, async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const [leads, dms, today] = await Promise.all([
      db`SELECT COUNT(*) as count FROM leads`,
      db`SELECT COUNT(*) as count FROM dm_log`,
      db`SELECT COUNT(*) as count FROM dm_log WHERE created_at >= NOW() - INTERVAL '24 hours' AND direction = 'outbound'`,
    ]);

    res.json({
      totalLeads: Number(leads[0].count),
      totalDMs: Number(dms[0].count),
      dmsSentToday: Number(today[0].count),
      activeKeywords: getKeywordRules().length,
      serverUptime: Math.floor(process.uptime()),
      status: 'online',
    });
  } catch (err) {
    logger.error({ err }, 'Admin stats error');
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── Keywords CRUD ────────────────────────────────────────────────────────────
adminRouter.get('/api/keywords', adminAuth, async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db`SELECT * FROM keyword_rules ORDER BY priority ASC`;
    if (rows.length > 0) {
      res.json(rows.map(dbRowToKeyword));
      return;
    }
    // Fallback to in-memory (loaded from JSON)
    res.json(getKeywordRules());
  } catch {
    res.json(getKeywordRules());
  }
});

adminRouter.post('/api/keywords', adminAuth, async (req: Request, res: Response) => {
  try {
    const rule = req.body as KeywordRule;
    if (!rule.id || !rule.keyword || !rule.response) {
      res.status(400).json({ error: 'id, keyword, and response are required' });
      return;
    }

    const db = getDb();
    await db`
      INSERT INTO keyword_rules (id, keyword, aliases, match_type, priority, enabled,
        cooldown_minutes, ask_email, platforms, comment_reply, response, follow_up)
      VALUES (
        ${rule.id}, ${rule.keyword}, ${JSON.stringify(rule.aliases || [])},
        ${rule.matchType || 'contains'}, ${rule.priority || 10}, ${rule.enabled !== false},
        ${rule.cooldownMinutes || 60}, ${rule.askEmail || false},
        ${JSON.stringify(rule.platforms || ['instagram', 'facebook'])},
        ${rule.commentReply || null}, ${JSON.stringify(rule.response)},
        ${rule.followUp ? JSON.stringify(rule.followUp) : null}
      )
      ON CONFLICT (id) DO UPDATE SET
        keyword = EXCLUDED.keyword, aliases = EXCLUDED.aliases,
        match_type = EXCLUDED.match_type, priority = EXCLUDED.priority,
        enabled = EXCLUDED.enabled, cooldown_minutes = EXCLUDED.cooldown_minutes,
        ask_email = EXCLUDED.ask_email, platforms = EXCLUDED.platforms,
        comment_reply = EXCLUDED.comment_reply, response = EXCLUDED.response,
        follow_up = EXCLUDED.follow_up, updated_at = NOW()
    `;

    // Reload in memory
    await reloadRulesFromDb();
    res.json({ success: true, rule });
  } catch (err) {
    logger.error({ err }, 'Error creating keyword');
    res.status(500).json({ error: 'Database error', detail: String(err) });
  }
});

adminRouter.put('/api/keywords/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rule = req.body as Partial<KeywordRule>;
    const db = getDb();

    await db`
      UPDATE keyword_rules SET
        keyword = COALESCE(${rule.keyword ?? null}, keyword),
        aliases = COALESCE(${rule.aliases ? JSON.stringify(rule.aliases) : null}::jsonb, aliases),
        match_type = COALESCE(${rule.matchType ?? null}, match_type),
        priority = COALESCE(${rule.priority ?? null}, priority),
        enabled = COALESCE(${rule.enabled ?? null}, enabled),
        cooldown_minutes = COALESCE(${rule.cooldownMinutes ?? null}, cooldown_minutes),
        ask_email = COALESCE(${rule.askEmail ?? null}, ask_email),
        platforms = COALESCE(${rule.platforms ? JSON.stringify(rule.platforms) : null}::jsonb, platforms),
        comment_reply = COALESCE(${rule.commentReply ?? null}, comment_reply),
        response = COALESCE(${rule.response ? JSON.stringify(rule.response) : null}::jsonb, response),
        follow_up = COALESCE(${rule.followUp ? JSON.stringify(rule.followUp) : null}::jsonb, follow_up),
        updated_at = NOW()
      WHERE id = ${id}
    `;

    await reloadRulesFromDb();
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error updating keyword');
    res.status(500).json({ error: 'Database error', detail: String(err) });
  }
});

adminRouter.delete('/api/keywords/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();
    await db`DELETE FROM keyword_rules WHERE id = ${id}`;
    await reloadRulesFromDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: String(err) });
  }
});

// Toggle enabled
adminRouter.patch('/api/keywords/:id/toggle', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();
    await db`UPDATE keyword_rules SET enabled = NOT enabled, updated_at = NOW() WHERE id = ${id}`;
    await reloadRulesFromDb();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: String(err) });
  }
});

// Sync from keywords.json → DB
adminRouter.post('/api/keywords/sync', adminAuth, async (_req: Request, res: Response) => {
  try {
    const { loadKeywordRules } = await import('../services/keyword.service.js');
    const rules = loadKeywordRules();
    const db = getDb();

    for (const rule of rules) {
      await db`
        INSERT INTO keyword_rules (id, keyword, aliases, match_type, priority, enabled,
          cooldown_minutes, ask_email, platforms, comment_reply, response, follow_up)
        VALUES (
          ${rule.id}, ${rule.keyword}, ${JSON.stringify(rule.aliases || [])},
          ${rule.matchType || 'contains'}, ${rule.priority || 10}, ${rule.enabled !== false},
          ${rule.cooldownMinutes || 60}, ${rule.askEmail || false},
          ${JSON.stringify(rule.platforms || ['instagram', 'facebook'])},
          ${rule.commentReply || null}, ${JSON.stringify(rule.response)},
          ${rule.followUp ? JSON.stringify(rule.followUp) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          keyword = EXCLUDED.keyword, aliases = EXCLUDED.aliases,
          match_type = EXCLUDED.match_type, priority = EXCLUDED.priority,
          enabled = EXCLUDED.enabled, cooldown_minutes = EXCLUDED.cooldown_minutes,
          response = EXCLUDED.response, follow_up = EXCLUDED.follow_up,
          updated_at = NOW()
      `;
    }

    await reloadRulesFromDb();
    res.json({ success: true, synced: rules.length });
  } catch (err) {
    res.status(500).json({ error: 'Sync error', detail: String(err) });
  }
});

// ─── Leads ────────────────────────────────────────────────────────────────────
adminRouter.get('/api/leads', adminAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { status, platform, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const rows = await db`
      SELECT * FROM leads
      WHERE (${status || null} IS NULL OR status = ${status || ''})
        AND (${platform || null} IS NULL OR platform = ${platform || ''})
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const total = await db`
      SELECT COUNT(*) as count FROM leads
      WHERE (${status || null} IS NULL OR status = ${status || ''})
        AND (${platform || null} IS NULL OR platform = ${platform || ''})
    `;

    res.json({ leads: rows, total: Number(total[0].count) });
  } catch (err) {
    logger.error({ err }, 'Error fetching leads');
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── DM Logs ──────────────────────────────────────────────────────────────────
adminRouter.get('/api/dm-logs', adminAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { direction, keyword_id, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const rows = await db`
      SELECT * FROM dm_log
      WHERE (${direction || null} IS NULL OR direction = ${direction || ''})
        AND (${keyword_id || null} IS NULL OR keyword_id = ${keyword_id || ''})
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `;

    const total = await db`SELECT COUNT(*) as count FROM dm_log`;
    res.json({ logs: rows, total: Number(total[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────
adminRouter.get('/api/health', adminAuth, (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    activeKeywords: getKeywordRules().length,
    env: process.env.NODE_ENV,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function reloadRulesFromDb(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db`SELECT * FROM keyword_rules WHERE enabled = true ORDER BY priority ASC`;
    const rules: KeywordRule[] = rows.map(dbRowToKeyword);
    setKeywordRules(rules);
  } catch (err) {
    logger.error({ err }, 'Failed to reload rules from DB');
  }
}

function dbRowToKeyword(r: any): KeywordRule {
  return {
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
  };
}
