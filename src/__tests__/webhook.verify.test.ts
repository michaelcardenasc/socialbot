import { describe, it, expect, vi } from 'vitest';
import { computeSignature } from '../webhooks/verify.js';

// Mock env module
vi.mock('../config/env.js', () => ({
  getEnv: () => ({
    ZERNIO_API_KEY: 'test_key',
    ZERNIO_WEBHOOK_SECRET: 'test_secret',
    ZERNIO_ACCOUNT_ID: 'acc_123',
    PORT: 3000,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ADMIN_API_KEY: 'test_admin_key',
  }),
}));

describe('webhook signature verification', () => {
  const secret = 'test_secret';

  it('computes correct HMAC signature', () => {
    const payload = JSON.stringify({ test: 'data' });
    const signature = computeSignature(secret, payload);

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces consistent signatures for same input', () => {
    const payload = '{"hello":"world"}';
    const sig1 = computeSignature(secret, payload);
    const sig2 = computeSignature(secret, payload);

    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = computeSignature(secret, 'payload1');
    const sig2 = computeSignature(secret, 'payload2');

    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different secrets', () => {
    const payload = 'same_payload';
    const sig1 = computeSignature('secret1', payload);
    const sig2 = computeSignature('secret2', payload);

    expect(sig1).not.toBe(sig2);
  });
});
