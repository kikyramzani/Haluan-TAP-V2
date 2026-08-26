import { key, redis } from "@/lib/redis";
import { buildCampaignCatalog, buildShopeeCampaigns, compareCampaigns } from "@/lib/catalog";
import { mergeCatalog } from "@/lib/catalog-overrides";
import { safeListOverrides } from "@/lib/catalog-store";
import { getBrandMetricResolver } from "@/lib/campaign-links";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

const DEVELOPMENT_CATALOG_CSV = "https://docs.google.com/spreadsheets/d/1uPzMJ1S7RAYgZagFAyT1gE2O7SPcTQCKc5852H1i4mQ/export?format=csv&gid=0";
const DEVELOPMENT_SHOPEE_CSV = "https://docs.google.com/spreadsheets/d/17XSBE_G3-3nmx86OWeqykFDShgoxgwb-1aIf8QnVvPc/export?format=csv&gid=0";
const REDIS_CAMPAIGN_CSV_KEY = key("campaign-links", "csv");
const REDIS_SHOPEE_CSV_KEY = key("campaign-links", "shopee", "csv");
let lastQualityFingerprint = "";

/**
 * Rute publik ini sengaja mendahulukan ekspor katalog yang display-safe
 * (`CAMPAIGN_CATALOG_*`) daripada feed link privat (`CAMPAIGN_LINKS_*`) — dua
 * sumber berbeda, dan pemisahan itu adalah lapisan pertahanan yang disengaja.
 *
 * Yang diperbaiki di sini hanya mode gagalnya: deployment yang hanya menyetel
 * variabel LINKS dulu membuat rute ini mati sementara halaman server tetap
 * hidup. Sekarang feed privat dipakai sebagai cadangan, dan tetap aman karena
 * respons ini tidak pernah memuat URL partner.
 */
async function sourceCsv(platform: "tiktok" | "shopee") {
  const isShopee = platform === "shopee";
  const envUrl = isShopee
    ? process.env.SHOPEE_CAMPAIGNS_CSV_URL
    : process.env.CAMPAIGN_CATALOG_CSV_URL || process.env.CAMPAIGN_LINKS_CSV_URL;
  const storage = isShopee
    ? process.env.SHOPEE_CAMPAIGNS_STORAGE
    : process.env.CAMPAIGN_CATALOG_STORAGE || process.env.CAMPAIGN_LINKS_STORAGE;
  const redisKey = isShopee ? REDIS_SHOPEE_CSV_KEY : REDIS_CAMPAIGN_CSV_KEY;

  if (envUrl) {
    const response = await fetch(envUrl, { headers: { accept: "text/csv" }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Campaign source response ${response.status}`);
    return response.text();
  }
  if (storage === "redis") {
    const stored = await redis<string | null>("GET", redisKey);
    if (!stored) throw new Error("Campaign catalog is unavailable");
    return stored;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Campaign catalog source is not configured");
  const response = await fetch(isShopee ? DEVELOPMENT_SHOPEE_CSV : DEVELOPMENT_CATALOG_CSV, {
    headers: { accept: "text/csv" },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Campaign source response ${response.status}`);
  return response.text();
}

const CACHE_HEADERS = { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" };

export async function GET(request: Request) {
  try {
    // Katalog tidak memuat link partner dan tetap berguna saat penghitung rate
    // limit sedang bermasalah. Pembacaan publik fail-open; rute auth dan tulis
    // tetap fail-closed di berkasnya masing-masing.
    try {
      const rate = await checkRateLimit("catalog-public", clientIp(request), 120, 300);
      if (!rate.allowed) return Response.json({ error: "Terlalu banyak permintaan." }, { status: 429 });
    } catch {
      // Sengaja diteruskan ke sumber katalog yang tersedia sendiri.
    }

    const platform = new URL(request.url).searchParams.get("platform")?.toLowerCase() === "shopee" ? "shopee" : "tiktok";
    const csv = await sourceCsv(platform);

    if (platform === "shopee") {
      // Override CMS berlaku untuk Shopee juga, tapi tanpa campaign buatan
      // admin: bentuknya TikTok dan tidak pernah ada di sheet Shopee.
      const overrides = await safeListOverrides();
      const built = buildShopeeCampaigns(csv);
      const campaigns = overrides.size
        ? mergeCatalog(built, overrides, { platform: "shopee", allowManual: false })
        : built;
      const categories = [...new Set(campaigns.map((campaign) => campaign.category))];
      return Response.json(
        {
          campaigns,
          meta: {
            total: campaigns.length,
            categories,
            platform: "Shopee Affiliate",
            sourceUpdatedAt: new Date().toISOString(),
            excludedInvalidRates: 0,
          },
        },
        { headers: CACHE_HEADERS },
      );
    }

    // Override CMS diterapkan di sini juga, bukan hanya di halaman yang dirender
    // server — kalau tidak, API publik dan halaman akan menampilkan angka berbeda
    // untuk brand yang sama.
    const [resolveMetric, overrides] = await Promise.all([getBrandMetricResolver(), safeListOverrides()]);
    const built = buildCampaignCatalog(csv, resolveMetric);
    const issues = built.issues;
    const campaigns = overrides.size
      ? mergeCatalog(built.campaigns, overrides, { platform: "tiktok" }).sort(compareCampaigns)
      : built.campaigns;

    const invalidBrands = new Set(issues.map((issue) => issue.brand));
    const qualityFingerprint = [...invalidBrands].sort().join("|");
    if (issues.length && qualityFingerprint !== lastQualityFingerprint && process.env.CATALOG_QUALITY_LOG !== "silent") {
      lastQualityFingerprint = qualityFingerprint;
      console.warn(`TAP catalog quality: ${issues.length} invalid cells across ${invalidBrands.size} brands`);
    }

    const categories = [...new Set(campaigns.map((campaign) => campaign.category))];
    return Response.json(
      {
        campaigns,
        meta: {
          total: campaigns.length,
          categories,
          platform: "TikTok Shop",
          sourceUpdatedAt: new Date().toISOString(),
          excludedInvalidRates: issues.length,
          excludedInvalidBrands: invalidBrands.size,
          brandsWithoutCommission: campaigns.filter((campaign) => campaign.commission === null).length,
          brandsWithSampleSupport: campaigns.filter((campaign) => campaign.hasSample === true).length,
        },
      },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json(
      { campaigns: [], meta: { total: 0, categories: [], sourceUpdatedAt: null, excludedInvalidRates: 0 } },
      { status: 503 },
    );
  }
}
