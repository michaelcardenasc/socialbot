import type { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const env = getEnv();
  const adminKey = env.ADMIN_API_KEY;

  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === adminKey) {
      next();
      return;
    }
  }

  // Check x-admin-key header
  const headerKey = req.headers['x-admin-key'] as string | undefined;
  if (headerKey && headerKey === adminKey) {
    next();
    return;
  }

  // Check cookie-based session
  const cookieKey = req.cookies?.adminKey;
  if (cookieKey && cookieKey === adminKey) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized', message: 'Invalid admin key' });
}

export function setAdminCookie(res: Response, key: string): void {
  res.cookie('adminKey', key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}
