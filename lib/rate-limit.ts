import { prisma } from "./db.ts";

export { retryAfterMessage } from "./rate-limit-message.ts";

/**
 * Fixed-window counter on Postgres (Phase 7 moved this off Redis — see the
 * rebuild plan's progress log for why). `identity` must already be safe to
 * persist indefinitely: callers hash any IP-derived identity first
 * (lib/hash-ip.ts) before it ever reaches this function.
 *
 * The upsert's ON CONFLICT DO UPDATE is what makes the increment atomic under
 * concurrent requests for the same bucket — same guarantee Redis INCR gave,
 * just expressed as a native Postgres upsert instead of a Lua-free atomic op.
 */
export async function checkRateLimit(scope: string, identity: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000 + 5000);
  const row = await prisma.rateLimitBucket.upsert({
    where: { scope_identity_bucket: { scope, identity, bucket } },
    create: { scope, identity, bucket, count: 1, expiresAt },
    update: { count: { increment: 1 } },
  });
  // Callers can tell the visitor when to come back instead of "try again later".
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket + 1) * windowSeconds - now / 1000));
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSeconds };
}
