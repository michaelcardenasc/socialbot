import postgres from 'postgres';
import { getEnv } from '../config/env.js';
import { logger } from '../utils/logger.js';

let sql: ReturnType<typeof postgres> | undefined;

export function getDb(): ReturnType<typeof postgres> {
  if (!sql) {
    const env = getEnv();
    sql = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  await db`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      ig_user_id TEXT NOT NULL,
      ig_username TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT,
      keyword_id TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram',
      conversation_id TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_ig_user_id_platform_idx ON leads (ig_user_id, platform)
  `;

  await db`
    CREATE TABLE IF NOT EXISTS dm_log (
      id SERIAL PRIMARY KEY,
      ig_user_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_type TEXT,
      keyword_id TEXT,
      content TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram',
      conversation_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`
    CREATE INDEX IF NOT EXISTS dm_log_ig_user_id_idx ON dm_log (ig_user_id)
  `;

  await db`
    CREATE TABLE IF NOT EXISTS keyword_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      aliases JSONB NOT NULL DEFAULT '[]',
      match_type TEXT NOT NULL DEFAULT 'contains',
      priority INTEGER NOT NULL DEFAULT 10,
      enabled BOOLEAN NOT NULL DEFAULT true,
      cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      ask_email BOOLEAN NOT NULL DEFAULT false,
      platforms JSONB NOT NULL DEFAULT '["instagram","facebook"]',
      comment_reply TEXT,
      response JSONB NOT NULL,
      follow_up JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  logger.info('Database initialized');
  await migrateDb(db);
}

async function migrateDb(db: ReturnType<typeof postgres>): Promise<void> {
  try {
    await db`ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'instagram'`;
    await db`ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_id TEXT`;
    await db`ALTER TABLE dm_log ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'instagram'`;
    await db`ALTER TABLE dm_log ADD COLUMN IF NOT EXISTS conversation_id TEXT`;
  } catch (err) {
    logger.error({ err }, 'Error during database migrations');
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = undefined;
  }
}
