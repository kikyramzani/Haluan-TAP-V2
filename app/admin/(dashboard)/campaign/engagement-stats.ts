import { prisma } from "../../../../lib/db";
import { siteWideConversionRatePct30d, conversionRatePct } from "../../../../lib/site-conversion-rate";
import {
  CLICK_WINDOW_DAYS,
  SAMPLE_WINDOW_DAYS,
  TRENDING_TOP_FRACTION,
  CONVERSION_MIN_CLICKS_30D,
  CONVERSION_RATE_MULTIPLIER,
  CONVERSION_RATE_FLOOR_PCT,
  resolveHotBadge,
} from "../../../../lib/hot-deals-config";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Recomputes the "Hot Deals" badge for every non-hidden campaign. See
 * lib/hot-deals-config.ts for the thresholds and priority order. Called
 * nightly by /api/cron/recompute-engagement-stats, the same
 * cache-table-recomputed-on-a-schedule pattern as
 * app/admin/(dashboard)/campaign/stats.ts's recomputeBrandPlatformStat, just
 * across the whole catalog at once instead of per-mutation. A 24h-stale
 * "trending" concept is normal (the same way a "Trending" shelf anywhere
 * else updates daily, not per click), so this doesn't need the synchronous
 * on-mutation recompute BrandPlatformStat has.
 *
 * Every non-hidden campaign is visited, not just ones with existing
 * activity. A campaign whose badge should CLEAR this week (clicks dried
 * up, brand un-featured) must still get its stale badge overwritten to
 * null, not skipped.
 */
export async function recomputeAllCampaignEngagementStats(): Promise<number> {
  const now = new Date();
  const clicksSince7d = new Date(now.getTime() - CLICK_WINDOW_DAYS * DAY_MS);
  const clicksSince30d = new Date(now.getTime() - SAMPLE_WINDOW_DAYS * DAY_MS);

  const [campaigns, siteRate] = await Promise.all([
    prisma.campaign.findMany({
      where: { status: { not: "HIDDEN" } },
      select: { id: true, brand: { select: { featured: true } } },
    }),
    siteWideConversionRatePct30d(now),
  ]);

  const [clicks7dGroups, clicks30dGroups, sampleGroups, savedGroups] = await Promise.all([
    prisma.linkClick.groupBy({ by: ["campaignId"], where: { createdAt: { gte: clicksSince7d } }, _count: { campaignId: true } }),
    prisma.linkClick.groupBy({ by: ["campaignId"], where: { createdAt: { gte: clicksSince30d } }, _count: { campaignId: true } }),
    prisma.sampleRequest.groupBy({ by: ["campaignId"], where: { createdAt: { gte: clicksSince30d }, campaignId: { not: null } }, _count: { campaignId: true } }),
    prisma.savedCampaign.groupBy({ by: ["campaignId"], _count: { campaignId: true } }),
  ]);

  const clicks7dById = new Map(clicks7dGroups.map((g) => [g.campaignId, g._count.campaignId]));
  const clicks30dById = new Map(clicks30dGroups.map((g) => [g.campaignId, g._count.campaignId]));
  const samplesById = new Map(sampleGroups.map((g) => [g.campaignId as string, g._count.campaignId]));
  const savedById = new Map(savedGroups.map((g) => [g.campaignId, g._count.campaignId]));

  // Trending cutoff self-scales with real traffic instead of staying a fixed
  // guess forever: the top decile among campaigns that got any clicks at all.
  const rankedClicks = [...clicks7dById.values()].filter((n) => n > 0).sort((a, b) => b - a);
  const trendingRankCutoff = rankedClicks.length ? rankedClicks[Math.max(0, Math.ceil(rankedClicks.length * TRENDING_TOP_FRACTION) - 1)] : Infinity;
  const conversionBar = Math.max((siteRate ?? 0) * CONVERSION_RATE_MULTIPLIER, CONVERSION_RATE_FLOOR_PCT);

  let recomputed = 0;
  for (const campaign of campaigns) {
    const clicks7d = clicks7dById.get(campaign.id) ?? 0;
    const clicks30d = clicks30dById.get(campaign.id) ?? 0;
    const sampleRequests30d = samplesById.get(campaign.id) ?? 0;
    const savedCount = savedById.get(campaign.id) ?? 0;
    const conversionRate = clicks30d >= CONVERSION_MIN_CLICKS_30D ? conversionRatePct(clicks30d, sampleRequests30d) : null;

    const badge = resolveHotBadge({
      featured: campaign.brand.featured,
      clicks7d,
      clicks30d,
      sampleRequests30d,
      savedCount,
      trendingRankCutoff,
      conversionBar,
    });

    await prisma.campaignEngagementStat.upsert({
      where: { campaignId: campaign.id },
      create: { campaignId: campaign.id, clicks7d, sampleRequests30d, savedCount, conversionRatePct: conversionRate, badge, recomputedAt: now },
      update: { clicks7d, sampleRequests30d, savedCount, conversionRatePct: conversionRate, badge, recomputedAt: now },
    });
    recomputed += 1;
  }

  return recomputed;
}
