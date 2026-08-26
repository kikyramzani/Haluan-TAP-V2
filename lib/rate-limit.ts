import { key, redis } from "./redis.ts";

export async function checkRateLimit(scope: string, identity: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const storageKey = key("limit", scope, identity, String(bucket));
  const count = await redis<number>("INCR", storageKey);
  if (count === 1) await redis("EXPIRE", storageKey, windowSeconds + 5);
  // Callers can tell the visitor when to come back instead of "try again later".
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket + 1) * windowSeconds - now / 1000));
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

export function retryAfterMessage(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return minutes > 1 ? `${minutes} menit` : "kurang dari satu menit";
}
