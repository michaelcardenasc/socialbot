import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  ZERNIO_API_KEY: z.string().min(1),
  ZERNIO_WEBHOOK_SECRET: z.string().min(1),
  ZERNIO_ACCOUNT_ID: z.string().min(1),
  ZERNIO_PROFILE_ID: z.string().optional().or(z.literal('')),
  MEDIA_BASE_URL: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ADMIN_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().optional().or(z.literal('')),
  EMAIL_FROM: z.string().default('InstaBot <noreply@example.com>'),
  WELCOME_EMAIL_TEMPLATE: z.string().default('bienvenido.html'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('Environment not loaded. Call loadEnv() first.');
  return _env;
}
