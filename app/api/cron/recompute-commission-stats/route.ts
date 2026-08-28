import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { recordCronRun } from "../../../../lib/cron-status";
import { recomputeBrandPlatformStat } from "../../../admin/(dashboard)/campaign/stats";

/**
 * Safety net, not the primary path: BrandPlatformStat is already recomputed
 * synchronously on every campaign/tier mutation (see app/admin/campaign/actions.ts).
 * This nightly sweep only catches drift — a stat row for a brand+platform
 * combo that never got recomputed (e.g. a direct DB fix) or one that no
 * longer has any campaigns and should be cleared.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const combos = await prisma.campaign.findMany({ distinct: ["brandId", "platform"], select: { brandId: true, platform: true } });
    for (const combo of combos) {
      await recomputeBrandPlatformStat(combo.brandId, combo.platform);
    }
    await recordCronRun({
      job: "recompute-commission-stats",
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      details: { statsRecomputed: combos.length },
    });
    try {
      await recordAudit({ actorId: "system:cron", action: "commission_stats.recompute", targetId: "brand-platform-stat", after: { statsRecomputed: combos.length } });
    } catch { /* The recompute already succeeded; the trail must not undo it. */ }
    return Response.json({ statsRecomputed: combos.length });
  } catch (error) {
    await recordCronRun({
      job: "recompute-commission-stats",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return Response.json({ error: "Recompute gagal." }, { status: 500 });
  }
}
