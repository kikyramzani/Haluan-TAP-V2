import { getCampaignCatalog } from "@/lib/catalog-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { hashIp } from "@/lib/hash-ip";

const CACHE_HEADERS = { "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" };

/**
 * Postgres-backed replacement for the old Sheets/Redis/override-CMS pipeline
 * (Phase 8 of the rebuild plan — see the plan's progress log). Response
 * envelope kept identical to the original for the two real client consumers
 * (app/request-sample/page.tsx, app/components/CampaignSheet.tsx): CSV parse
 * quality fields (excludedInvalidRates/excludedInvalidBrands) are always 0
 * here since a Postgres row can't carry an unparseable commission cell —
 * that class of problem was resolved once, at Phase 2's migration.
 */
export async function GET(request: Request) {
  try {
    // Katalog tidak memuat link partner dan tetap berguna saat penghitung rate
    // limit sedang bermasalah. Pembacaan publik fail-open; rute auth dan tulis
    // tetap fail-closed di berkasnya masing-masing.
    try {
      const rate = await checkRateLimit("catalog-public", hashIp(clientIp(request)), 120, 300);
      if (!rate.allowed) return Response.json({ error: "Terlalu banyak permintaan." }, { status: 429 });
    } catch {
      // Sengaja diteruskan ke sumber katalog yang tersedia sendiri.
    }

    const platform = new URL(request.url).searchParams.get("platform")?.toLowerCase() === "shopee" ? "shopee" : "tiktok";
    const campaigns = await getCampaignCatalog(platform);
    const categories = [...new Set(campaigns.map((campaign) => campaign.category))];

    if (platform === "shopee") {
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

    return Response.json(
      {
        campaigns,
        meta: {
          total: campaigns.length,
          categories,
          platform: "TikTok Shop",
          sourceUpdatedAt: new Date().toISOString(),
          excludedInvalidRates: 0,
          excludedInvalidBrands: 0,
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
