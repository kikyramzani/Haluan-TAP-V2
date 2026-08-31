import { recordAudit } from "../../../../lib/audit";
import { recordCronRun } from "../../../../lib/cron-status";
import { recomputeAllCampaignEngagementStats } from "../../../admin/(dashboard)/campaign/engagement-stats";

/**
 * The only path that computes Hot Deals badges — unlike BrandPlatformStat,
 * nothing recomputes this synchronously on mutation. A 24h-stale "trending"
 * rail is normal (see engagement-stats.ts's own comment); this is the
 * primary path, not a safety net.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const statsRecomputed = await recomputeAllCampaignEngagementStats();
    await recordCronRun({
      job: "recompute-engagement-stats",
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      details: { statsRecomputed },
    });
    try {
      await recordAudit({ actorId: "system:cron", action: "engagement_stats.recompute", targetId: "campaign-engagement-stat", after: { statsRecomputed } });
    } catch { /* The recompute already succeeded; the trail must not undo it. */ }
    return Response.json({ statsRecomputed });
  } catch (error) {
    await recordCronRun({
      job: "recompute-engagement-stats",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return Response.json({ error: "Recompute gagal." }, { status: 500 });
  }
}
