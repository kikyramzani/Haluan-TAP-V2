import { prisma } from "./db.ts";
import { compareCampaigns } from "./catalog.ts";
import type { Campaign } from "./catalog.ts";
import { pickPrimaryLink, type TapLink } from "./campaign-links.ts";
import { minMaxCommission } from "./commission-display.ts";
import type { Platform as PrismaPlatform } from "@prisma/client";

/**
 * Postgres-backed replacement for lib/campaign-links.ts's public catalog
 * reads (Phase 2 of the rebuild plan — see
 * /Users/macbook/.claude/plans/kamu-lihat-dari-bagian-purrfect-hopcroft.md).
 * Same function names/shapes as the Sheet-backed originals so the pages that
 * render /deals, /deal/[slug], and /go/[slug] only needed an import-path
 * change, not a rewrite. `pickPrimaryLink` has no data dependency and is
 * still imported from lib/campaign-links.ts directly.
 */

function toPrismaPlatform(platform: "tiktok" | "shopee"): PrismaPlatform {
  return platform === "shopee" ? "SHOPEE_AFFILIATE" : "TIKTOK_SHOP";
}

function toLegacyPlatform(platform: PrismaPlatform): Campaign["platform"] {
  return platform === "SHOPEE_AFFILIATE" ? "Shopee Affiliate" : "TikTok Shop";
}

/** classifyExpiry() (lib/campaign-flags.ts) only accepts this exact "dd/mm/yyyy" shape. */
function toSheetDate(date: Date | null): string | null {
  if (!date) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

const campaignInclude = {
  brand: { include: { category: true } },
  tiers: { orderBy: { sortIndex: "asc" as const } },
  links: { orderBy: { sortIndex: "asc" as const } },
};

/**
 * Katalog saja. campaignInclude sengaja tidak ikut dilebarkan karena juga
 * dipakai getTapLinks dan halaman /deal/[slug], yang tidak butuh badge.
 * `select: { badge: true }` menjaga kolom metrik operasional (clicks7d,
 * conversionRatePct, dst.) tidak ikut terbaca tiap kali katalog dimuat — dan
 * tidak ikut terkirim lewat /api/campaigns, yang menyerialkan Campaign[] apa
 * adanya.
 */
const catalogInclude = { ...campaignInclude, engagementStat: { select: { badge: true } } };

type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findFirst<{ include: typeof campaignInclude }>>>;

function toCampaign(row: NonNullable<CampaignRow>): Campaign {
  const rates = row.tiers.map((tier) => (tier.commission === null ? null : Number(tier.commission)));
  const { min } = minMaxCommission(row.tiers);
  return {
    id: row.slug,
    brand: row.brand.displayName,
    category: row.brand.category?.name ?? "Lainnya",
    platform: toLegacyPlatform(row.platform),
    commission: min,
    tierCommissions: rates,
    campaignCount: row.tiers.length,
    hasSample: row.hasSample,
    // No brand-metrics sheet was migrated (none was available at Phase 2 —
    // see the plan's progress log), so GMV-based ranking is unavailable;
    // compareCampaigns() already treats a null gmvRank as "sort last by that
    // key", falling through to commission/alphabetical.
    gmvRank: null,
    updated: row.updatedAt.toISOString(),
    campaign: row.brand.displayName,
    // The sheet's own Image URL column was empty for 100% of current brands
    // (confirmed during migration) — brandLogo() local static lookup is the
    // real, unchanged source BrandMark already falls back to.
    image: null,
    specialLivePrice: row.specialLivePrice,
    expiresAt: toSheetDate(row.validUntil),
    newSku: row.newSku,
    // Gerbang pertama: status. Katalog memakai `status: { not: "HIDDEN" }`
    // sehingga campaign ENDED ikut tampil — dan campaign yang sudah berakhir
    // tidak boleh membawa badge. Menyempitkan `where` malah akan membuang
    // campaign berakhir dari /deals, yang bukan yang diminta.
    // Gerbang kedua adalah tanggal kedaluwarsa, di liveHotBadge()
    // (app/components/HotBadge.tsx): sebuah campaign bisa saja ACTIVE tapi
    // validUntil-nya sudah lewat.
    hotBadge:
      row.status === "ACTIVE"
        ? ((row as { engagementStat?: { badge: Campaign["hotBadge"] | null } | null }).engagementStat?.badge ?? undefined)
        : undefined,
  };
}

export async function getCampaignCatalog(platform: "tiktok" | "shopee"): Promise<Campaign[]> {
  const rows = await prisma.campaign.findMany({
    where: { platform: toPrismaPlatform(platform), status: { not: "HIDDEN" } },
    include: catalogInclude,
  });
  return rows.map(toCampaign).sort(compareCampaigns);
}

export async function getTapLinks(campaignId: string): Promise<TapLink[]> {
  const row = await prisma.campaign.findUnique({ where: { slug: campaignId }, include: campaignInclude });
  if (!row || row.status === "HIDDEN") return [];
  const expiresAt = toSheetDate(row.validUntil);
  return row.links.map((link, index) => ({
    url: link.url,
    brand: row.brand.displayName,
    label: row.tiers[index]?.label || `Campaign ${index + 1}`,
    hasSample: Boolean(row.hasSample),
    expiresAt,
    commission: row.tiers[index]?.commission === null || row.tiers[index]?.commission === undefined ? null : Number(row.tiers[index].commission),
  }));
}

export async function getPrimaryTapLink(campaignId: string): Promise<TapLink | null> {
  return pickPrimaryLink(await getTapLinks(campaignId));
}
