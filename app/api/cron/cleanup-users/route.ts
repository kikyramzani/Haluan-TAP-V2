import { cleanupExpiredPendingUsers } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { recordCronRun } from "../../../../lib/cron-status";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const removed = await cleanupExpiredPendingUsers();
    // Postgres transactions never leave a phone/email claim orphaned or a
    // challenge commit half-settled the way the old Redis primitives could —
    // both reconciliation sweeps that used to run here are gone, not just
    // skipped. Expired sessions are routine housekeeping, not correctness.
    const expiredSessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    // Rate-limit buckets (Phase 7, now on Postgres — see lib/rate-limit.ts)
    // are equally routine: a stale bucket is inert, this just reclaims space.
    const expiredRateLimits = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await recordCronRun({
      job: "cleanup-users",
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      removed,
      expiredSessionsRemoved: expiredSessions.count,
      details: { expiredRateLimitBucketsRemoved: expiredRateLimits.count },
    });
    try {
      await recordAudit({ actorId: "system:cron", action: "users.cleanup", targetId: "pending-users", after: { removed, expiredSessionsRemoved: expiredSessions.count, expiredRateLimitBucketsRemoved: expiredRateLimits.count, durationMs: Date.now() - started } });
    } catch { /* Cleanup already succeeded; the trail must not undo it. */ }
    return Response.json({ removed, expiredSessionsRemoved: expiredSessions.count, expiredRateLimitBucketsRemoved: expiredRateLimits.count });
  } catch (error) {
    // A failed sweep must be as visible as a successful one.
    await recordCronRun({
      job: "cleanup-users",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return Response.json({ error: "Pembersihan gagal." }, { status: 500 });
  }
}
