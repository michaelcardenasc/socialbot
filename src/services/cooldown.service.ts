const cooldowns = new Map<string, number>();
const hourlyCounters = new Map<string, { count: number; resetAt: number }>();

const MAX_DMS_PER_HOUR = 100; // Increased for testing

export function isOnCooldown(userId: string, keywordId: string, cooldownMinutes: number): boolean {
  if (cooldownMinutes <= 0) return false;
  const key = `${userId}:${keywordId}`;
  const lastTrigger = cooldowns.get(key);
  if (!lastTrigger) return false;
  return Date.now() - lastTrigger < cooldownMinutes * 60 * 1000;
}

export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = hourlyCounters.get(userId);

  if (!entry || now >= entry.resetAt) {
    return false;
  }

  return entry.count >= MAX_DMS_PER_HOUR;
}

export function recordTrigger(userId: string, keywordId: string): void {
  const key = `${userId}:${keywordId}`;
  cooldowns.set(key, Date.now());

  const now = Date.now();
  const entry = hourlyCounters.get(userId);
  const oneHour = 60 * 60 * 1000;

  if (!entry || now >= entry.resetAt) {
    hourlyCounters.set(userId, { count: 1, resetAt: now + oneHour });
  } else {
    entry.count++;
  }
}

export function resetAll(): void {
  cooldowns.clear();
  hourlyCounters.clear();
}
