import type { Platform } from "@prisma/client";
import { prisma } from "../../../../lib/db";
import { minMaxCommission } from "../../../../lib/commission-display";

/**
 * BrandPlatformStat is a read cache for the public catalog (min/max commission
 * + tier count per brand+platform). It must be recomputed every time a
 * campaign's tiers change for that brand+platform. Nothing recomputes it on
 * a schedule.
 *
 * campaignCount here intentionally means "tier count", not "Campaign row
 * count": the legacy sheet-backed catalog (lib/catalog.ts, lib/catalog-db.ts)
 * has always used campaignCount === tiers.length (a "campaign" in the public
 * UI is a purchasable tier/link pair, not a CampaignTier's parent row), and
 * this cache table is meant to mirror that same public-facing number.
 */
export async function recomputeBrandPlatformStat(brandId: string, platform: Platform) {
  const tiers = await prisma.campaignTier.findMany({
    where: { campaign: { brandId, platform } },
    select: { commission: true },
  });

  const { min: minCommission, max: maxCommission } = minMaxCommission(tiers);
  const campaignCount = tiers.length;

  await prisma.brandPlatformStat.upsert({
    where: { brandId_platform: { brandId, platform } },
    create: { brandId, platform, minCommission, maxCommission, campaignCount, recomputedAt: new Date() },
    update: { minCommission, maxCommission, campaignCount, recomputedAt: new Date() },
  });
}
