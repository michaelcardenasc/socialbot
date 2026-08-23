import express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { loadEnv } from './config/env.js';
import { logger } from './utils/logger.js';
import { loadKeywordRulesFromDb } from './services/keyword.service.js';
import { initDb } from './services/db.js';
import { startEmailReminder } from './services/reminder.service.js';
import { webhookRouter } from './webhooks/router.js';
import { adminRouter } from './admin/router.js';

// Load and validate env vars
const env = loadEnv();

const app = express();

// Parse JSON body and preserve raw body for signature verification
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(cookieParser());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? '1.0.0',
  });
});

// Webhook routes
app.use('/webhook', webhookRouter);

// Admin API routes
app.use('/admin', adminRouter);

// Admin Dashboard SPA — serve static HTML (public/admin folder at project root)
const publicDir = join(process.cwd(), 'public', 'admin');
app.use('/dashboard', express.static(publicDir));
app.get('/dashboard', (_req: Request, res: Response) => {
  res.sendFile(join(publicDir, 'index.html'));
});

// Initialize database, load rules, start server
initDb()
  .then(async () => {
    await loadKeywordRulesFromDb();
    startEmailReminder();
    app.listen(env.PORT, '0.0.0.0', () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SocialBot server started');
    });
  })
  .catch((err) => {
    logger.fatal({ err }, 'Failed to initialize database');
    process.exit(1);
  });

export { app };
