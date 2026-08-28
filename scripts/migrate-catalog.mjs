// Phase 2 catalog migration — Sheet + (empty, confirmed) CampaignOverride → Postgres.
//
// Reuses the existing, unmodified lib/campaign-links.ts / lib/catalog.ts /
// lib/commission.ts / lib/shopee-catalog.ts / lib/brand-key.ts parsers and
// app/brand-assets.ts's logo matcher — this script does not reimplement any
// parsing rule, it only writes the result to Prisma.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-catalog.mjs            (dry run, no writes)
//   node --env-file=.env.local scripts/migrate-catalog.mjs --confirm  (writes)

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCampaignCatalog, getTapLinks } from "../lib/campaign-links.ts";
import { brandKey } from "../lib/brand-key.ts";
import { brandLogo } from "../app/brand-assets.ts";

const CONFIRM = process.argv.includes("--confirm");

// getTapLinks() re-fetches+re-parses the whole sheet per call (fine inside
// Next.js's request-scoped fetch cache, not fine called ~800 times in a
// plain Node script) — memoize the two sheet fetches for this run only.
const fetchCache = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const key = String(url);
  if (fetchCache.has(key)) return fetchCache.get(key).clone();
  const response = await realFetch(url, init);
  if (response.ok) fetchCache.set(key, response.clone());
  return response;
};

const CATEGORY_SLUGS = {
  "Beauty & Health": "beauty-health",
  "Tech": "tech",
  "Home & Living": "home-living",
  "Food & FMCG": "food-fmcg",
  "Mom & Baby": "mom-baby",
  "Fashion": "fashion",
  "Sports": "sports",
  "Lainnya": "lainnya",
};

/** Sheet dates are "dd/mm/yyyy" (see lib/campaign-flags.ts classifyExpiry) or the manual-ended marker "01/01/2000". */
function parseSheetDate(value) {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date;
}

async function buildPlan() {
  const [tiktok, shopee] = await Promise.all([getCampaignCatalog("tiktok"), getCampaignCatalog("shopee")]);

  /** @type {Map<string, { displayName: string, category: string, logoUrl: string|null, entries: Array<{platform: "TIKTOK_SHOP"|"SHOPEE_AFFILIATE", campaign: any}> }>} */
  const brands = new Map();
  const categoryConflicts = [];

  for (const [platform, campaigns] of [["TIKTOK_SHOP", tiktok], ["SHOPEE_AFFILIATE", shopee]]) {
    for (const campaign of campaigns) {
      const bKey = brandKey(campaign.brand);
      let entry = brands.get(bKey);
      if (!entry) {
        entry = { displayName: campaign.brand, category: campaign.category, logoUrl: brandLogo(campaign.brand), entries: [] };
        brands.set(bKey, entry);
      } else if (entry.category !== campaign.category) {
        categoryConflicts.push({ brandKey: bKey, displayName: entry.displayName, keptCategory: entry.category, seenOnOtherPlatform: campaign.category });
      }
      entry.entries.push({ platform, campaign });
    }
  }

  const plan = { brands: [], warnings: { categoryConflicts, forcedNullShopeeRates: [], noLogo: [], noLinks: [] } };

  for (const [bKey, entry] of brands) {
    const brandPlan = { brandKey: bKey, displayName: entry.displayName, category: entry.category, logoUrl: entry.logoUrl, campaigns: [] };
    if (!entry.logoUrl) plan.warnings.noLogo.push(entry.displayName);

    for (const { platform, campaign } of entry.entries) {
      const links = await getTapLinks(campaign.id);
      if (!links.length) plan.warnings.noLinks.push(`${entry.displayName} (${platform})`);

      const tiers = links.map((link, index) => {
        let commission = link.commission;
        if (platform === "SHOPEE_AFFILIATE" && commission !== null) {
          plan.warnings.forcedNullShopeeRates.push({ brand: entry.displayName, label: link.label, rate: commission });
          commission = null;
        }
        return { label: link.label || `Campaign ${index + 1}`, commission, url: link.url, hasSample: link.hasSample };
      });

      const usableRates = tiers.map((t) => t.commission).filter((c) => typeof c === "number");
      const validUntil = parseSheetDate(campaign.expiresAt);
      const status = validUntil && validUntil.getTime() < Date.now() ? "ENDED" : "ACTIVE";

      brandPlan.campaigns.push({
        platform,
        commissionType: platform === "TIKTOK_SHOP" ? "PERSENTASE" : "KETENTUAN_PLATFORM",
        status,
        hasSample: campaign.hasSample,
        newSku: campaign.newSku,
        specialLivePrice: campaign.specialLivePrice,
        validUntil,
        tiers,
        minCommission: usableRates.length ? Math.min(...usableRates) : null,
        maxCommission: usableRates.length ? Math.max(...usableRates) : null,
        tierCount: tiers.length,
        sourceCampaignId: campaign.id,
      });
    }
    plan.brands.push(brandPlan);
  }

  return plan;
}

function printReport(plan) {
  const totalCampaigns = plan.brands.reduce((sum, b) => sum + b.campaigns.length, 0);
  const totalTiers = plan.brands.reduce((sum, b) => sum + b.campaigns.reduce((s, c) => s + c.tiers.length, 0), 0);
  console.log(`\n=== Dry-run report ===`);
  console.log(`Brands: ${plan.brands.length}`);
  console.log(`Campaigns (brand x platform): ${totalCampaigns}`);
  console.log(`Tiers/links total: ${totalTiers}`);
  console.log(`Brands without a resolved local logo: ${plan.warnings.noLogo.length}`);
  if (plan.warnings.noLogo.length) console.log(`  e.g. ${plan.warnings.noLogo.slice(0, 15).join(", ")}${plan.warnings.noLogo.length > 15 ? ", ..." : ""}`);
  console.log(`Brand campaigns with zero links found: ${plan.warnings.noLinks.length}`);
  if (plan.warnings.noLinks.length) console.log(`  ${plan.warnings.noLinks.slice(0, 15).join(", ")}${plan.warnings.noLinks.length > 15 ? ", ..." : ""}`);
  console.log(`Category conflicts across platforms (kept the first seen): ${plan.warnings.categoryConflicts.length}`);
  for (const c of plan.warnings.categoryConflicts) console.log(`  ${c.displayName}: kept "${c.keptCategory}", other platform said "${c.seenOnOtherPlatform}"`);
  console.log(`Shopee rows with a non-null rate forced to null (Shopee never shows a fixed %): ${plan.warnings.forcedNullShopeeRates.length}`);
  for (const r of plan.warnings.forcedNullShopeeRates.slice(0, 20)) console.log(`  ${r.brand} / ${r.label}: source had ${r.rate}%`);
  console.log("");
}

/**
 * Bulk-insert instead of one row-at-a-time create() per tier/link inside a
 * single interactive transaction: at ~900 tiers + ~900 links, that shape did
 * ~2,700 sequential network round-trips to Neon and blew the 120s transaction
 * timeout before finishing (confirmed rolled back cleanly — see git history
 * of this file for the earlier attempt). IDs are generated up front so
 * children can reference parents without waiting on a round-trip; each
 * createMany below is a single statement, and the whole run is idempotent
 * (upsert on Brand, delete-then-recreate on each Campaign's children) so a
 * second run after a partial failure just reconciles instead of duplicating.
 */
async function writePlan(prisma, plan) {
  const categoryIds = new Map();
  for (const [name, slug] of Object.entries(CATEGORY_SLUGS)) {
    const category = await prisma.category.upsert({ where: { slug }, create: { name, slug }, update: { name } });
    categoryIds.set(name, category.id);
  }

  const brandRows = plan.brands.map((b) => ({
    id: randomUUID(),
    brandKey: b.brandKey,
    displayName: b.displayName,
    categoryId: categoryIds.get(b.category) ?? null,
    logoUrl: b.logoUrl,
  }));

  // Upsert one at a time (no bulk "upsert many" in Prisma) but this is cheap:
  // only ~700 rows, and re-running the whole script is expected to be routine
  // (e.g. via the future /admin/import UI), so brands must never duplicate.
  const brandIdByKey = new Map();
  for (const row of brandRows) {
    const brand = await prisma.brand.upsert({
      where: { brandKey: row.brandKey },
      create: row,
      update: { displayName: row.displayName, categoryId: row.categoryId, logoUrl: row.logoUrl },
    });
    brandIdByKey.set(row.brandKey, brand.id);
  }

  const campaignRows = [];
  const tierRows = [];
  const linkRows = [];
  const statRows = [];

  for (const brandPlan of plan.brands) {
    const brandId = brandIdByKey.get(brandPlan.brandKey);
    for (const campaignPlan of brandPlan.campaigns) {
      const campaignId = randomUUID();
      campaignRows.push({
        id: campaignId,
        brandId,
        // Already the exact id getCampaignCatalog()/getTapLinks() compute
        // today (brandSlug() for TikTok, `shopee-${slug()}` for Shopee) —
        // stored verbatim so /deal/[slug] and /go/[slug] keep working
        // unchanged once repointed at Postgres.
        slug: campaignPlan.sourceCampaignId,
        platform: campaignPlan.platform,
        commissionType: campaignPlan.commissionType,
        status: campaignPlan.status,
        hasSample: campaignPlan.hasSample,
        newSku: campaignPlan.newSku,
        specialLivePrice: campaignPlan.specialLivePrice,
        validUntil: campaignPlan.validUntil,
      });
      campaignPlan.tiers.forEach((tier, index) => {
        tierRows.push({ id: randomUUID(), campaignId, label: tier.label, commission: tier.commission, sortIndex: index });
        linkRows.push({ id: randomUUID(), campaignId, url: tier.url, isPrimary: index === 0, sortIndex: index });
      });
      statRows.push({
        id: randomUUID(),
        brandId,
        platform: campaignPlan.platform,
        minCommission: campaignPlan.minCommission,
        maxCommission: campaignPlan.maxCommission,
        campaignCount: campaignPlan.tierCount,
      });
    }
  }

  // Idempotency for a re-run: this script owns every Campaign for a brand it
  // just resolved from the sheets, so replacing them wholesale is safe and
  // avoids ever accumulating duplicate tiers/links from a prior partial run.
  await prisma.campaign.deleteMany({ where: { brandId: { in: [...brandIdByKey.values()] } } });

  await prisma.campaign.createMany({ data: campaignRows });
  await batchedCreateMany(prisma.campaignTier, tierRows);
  await batchedCreateMany(prisma.campaignLink, linkRows);
  for (const stat of statRows) {
    await prisma.brandPlatformStat.upsert({
      where: { brandId_platform: { brandId: stat.brandId, platform: stat.platform } },
      create: stat,
      update: { minCommission: stat.minCommission, maxCommission: stat.maxCommission, campaignCount: stat.campaignCount, recomputedAt: new Date() },
    });
  }

  return { brandCount: brandRows.length, campaignCount: campaignRows.length, tierCount: tierRows.length, linkCount: linkRows.length };
}

async function batchedCreateMany(model, rows, batchSize = 2000) {
  for (let start = 0; start < rows.length; start += batchSize) {
    await model.createMany({ data: rows.slice(start, start + batchSize) });
  }
}

const plan = await buildPlan();
printReport(plan);

if (!CONFIRM) {
  console.log("Dry run only — no rows written. Re-run with --confirm to write.");
  process.exit(0);
}

const adapter = new PrismaPg({ connectionString: process.env.POSTGRES_PRISMA_URL });
const prisma = new PrismaClient({ adapter });
const result = await writePlan(prisma, plan);
console.log("Written:", JSON.stringify(result));
await prisma.$disconnect();
