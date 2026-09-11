import { revalidateTag } from "next/cache";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { CAMPAIGN_CATALOG_TAG } from "../../../../lib/catalog-db";
import { recordCronRun } from "../../../../lib/cron-status";
import { notifyCampaignEndingSoon } from "../../../../lib/notifications";

const ENDING_SOON_WINDOW_DAYS = 3;

/**
 * Two independent sweeps sharing one nightly slot: (1) flip ACTIVE campaigns
 * past their validUntil to ENDED, so the public catalog stops offering an
 * expired deal; (2) notify creators about campaigns ending within the next
 * few days, once each. Campaign.endingSoonNotifiedAt is the dedup guard so a
 * campaign already in its ending-soon window doesn't renotify every night.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const now = new Date();
  try {
    const expired = await prisma.campaign.updateMany({
      where: { status: "ACTIVE", validUntil: { lt: now } },
      data: { status: "ENDED" },
    });

    const endingSoonBefore = new Date(now.getTime() + ENDING_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const endingSoon = await prisma.campaign.findMany({
      where: { status: "ACTIVE", validUntil: { gte: now, lte: endingSoonBefore }, endingSoonNotifiedAt: null },
      select: { id: true },
    });
    for (const campaign of endingSoon) {
      await notifyCampaignEndingSoon(campaign.id);
    }

    await recordCronRun({
      job: "expire-campaigns",
      status: "succeeded",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      details: { campaignsExpired: expired.count, endingSoonNotified: endingSoon.length },
    });
    try {
      await recordAudit({
        actorId: "system:cron",
        action: "campaigns.expire_sweep",
        targetId: "campaign",
        after: { campaignsExpired: expired.count, endingSoonNotified: endingSoon.length },
      });
    } catch { /* The sweep already succeeded; the trail must not undo it. */ }

    /**
     * Sapuan ini mengubah `status`, yang dibaca katalog publik. Tanpa ini
     * campaign yang baru ditandai ENDED masih ditawarkan sampai TTL cache habis.
     *
     * revalidateTag dengan profil "max", bukan updateTag: updateTag melempar di
     * dalam route handler, dan "max" memang pas di sini karena tidak ada satu
     * pun manusia yang sedang menunggu hasilnya.
     */
    if (expired.count > 0) revalidateTag(CAMPAIGN_CATALOG_TAG, "max");

    return Response.json({ campaignsExpired: expired.count, endingSoonNotified: endingSoon.length });
  } catch (error) {
    await recordCronRun({
      job: "expire-campaigns",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return Response.json({ error: "Sweep gagal." }, { status: 500 });
  }
}
