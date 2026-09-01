import { datastoreReady, key, redis } from "./redis.ts";
import { cleanShopeeBrand, extractShopeeUrls, slug } from "./shopee-catalog.ts";
import { buildCampaignCatalog, buildShopeeCampaigns, compareCampaigns, parseCsv } from "./catalog.ts";
import { parseCommissionCell } from "./commission.ts";
import { buildBrandMetrics, lookupBrandMetric } from "./brand-metrics.ts";
import { brandSlug } from "./brand-key.ts";

const DEVELOPMENT_SHEET_CSV = "https://docs.google.com/spreadsheets/d/1uPzMJ1S7RAYgZagFAyT1gE2O7SPcTQCKc5852H1i4mQ/export?format=csv&gid=0";
const DEVELOPMENT_SHOPEE_CSV = "https://docs.google.com/spreadsheets/d/17XSBE_G3-3nmx86OWeqykFDShgoxgwb-1aIf8QnVvPc/export?format=csv&gid=0";
const REDIS_CAMPAIGN_CSV_KEY = key("campaign-links", "csv");
const REDIS_SHOPEE_CSV_KEY = key("campaign-links", "shopee", "csv");
const REDIS_BRAND_METRICS_CSV_KEY = key("brand-metrics", "csv");

function campaignLinkSource() {
  const source = process.env.CAMPAIGN_LINKS_CSV_URL || (process.env.NODE_ENV !== "production" ? DEVELOPMENT_SHEET_CSV : "");
  if (!source) throw new Error("CAMPAIGN_LINK_SOURCE_UNAVAILABLE");
  const url = new URL(source);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("CAMPAIGN_LINK_SOURCE_INVALID");
  return url.toString();
}

/**
 * Sheet metrik bersifat opsional. Bila belum disinkronkan, katalog tetap tampil
 * lengkap. Hanya status sample dan urutan rekomendasi yang tidak tersedia.
 */
async function loadBrandMetricsCsv() {
  if (process.env.BRAND_METRICS_CSV_URL) {
    try {
      const response = await fetch(process.env.BRAND_METRICS_CSV_URL, { headers: { accept: "text/csv" }, next: { revalidate: 300 } });
      if (response.ok) return response.text();
    } catch { /* metrik opsional, katalog tetap jalan */ }
    return "";
  }
  if (!datastoreReady()) return "";
  try { return (await redis<string | null>("GET", REDIS_BRAND_METRICS_CSV_KEY)) ?? ""; }
  catch { return ""; }
}

export async function getBrandMetricResolver() {
  const csv = await loadBrandMetricsCsv();
  if (!csv.trim()) return undefined;
  const metrics = buildBrandMetrics(csv);
  return metrics.size ? (brand: string) => lookupBrandMetric(brand, metrics) : undefined;
}

async function loadCampaignCsv(platform: "tiktok" | "shopee") {
  if (platform === "shopee") {
    if (!process.env.SHOPEE_CAMPAIGNS_CSV_URL && process.env.SHOPEE_CAMPAIGNS_STORAGE === "redis") {
      const csv = await redis<string | null>("GET", REDIS_SHOPEE_CSV_KEY);
      if (!csv) throw new Error("CAMPAIGN_LINK_SOURCE_UNAVAILABLE");
      return csv;
    }
    const source = process.env.SHOPEE_CAMPAIGNS_CSV_URL || (process.env.NODE_ENV !== "production" ? DEVELOPMENT_SHOPEE_CSV : "");
    if (!source) throw new Error("CAMPAIGN_LINK_SOURCE_UNAVAILABLE");
    const response = await fetch(source, { headers: { accept: "text/csv" }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error("CAMPAIGN_SOURCE_UNAVAILABLE");
    return response.text();
  }
  if (!process.env.CAMPAIGN_LINKS_CSV_URL && process.env.CAMPAIGN_LINKS_STORAGE === "redis") {
    const csv = await redis<string | null>("GET", REDIS_CAMPAIGN_CSV_KEY);
    if (!csv) throw new Error("CAMPAIGN_LINK_SOURCE_UNAVAILABLE");
    return csv;
  }
  const token = process.env.CAMPAIGN_LINKS_AUTH_TOKEN;
  const response = await fetch(campaignLinkSource(), { headers: { accept: "text/csv", ...(token ? { authorization: `Bearer ${token}` } : {}) }, next: { revalidate: 300 } });
  if (!response.ok) throw new Error("CAMPAIGN_SOURCE_UNAVAILABLE");
  return response.text();
}

/**
 * Katalog publik: sheet → metrik brand.
 *
 * Kept only for scripts/migrate-catalog.mjs's ops-fallback re-migration path
 * (Phase 8. Every live page reads Postgres via lib/catalog-db.ts instead).
 * The admin-override merge layer that used to run last here is gone: the old
 * Redis-backed CampaignOverride CMS never had any real data (confirmed before
 * Phase 2's migration) and was fully replaced by the Postgres-backed
 * /admin/campaign, /admin/brand, etc. in Phase 4. There is no longer any
 * write path that could ever populate an override.
 */
export async function getCampaignCatalog(platform: "tiktok" | "shopee") {
  if (platform === "shopee") {
    const csv = await loadCampaignCsv(platform);
    return buildShopeeCampaigns(csv);
  }
  const [csv, resolveMetric] = await Promise.all([loadCampaignCsv(platform), getBrandMetricResolver()]);
  const { campaigns } = buildCampaignCatalog(csv, resolveMetric);
  return campaigns.sort(compareCampaigns);
}

/**
 * Satu link campaign beserta komisinya.
 *
 * Komisinya dibaca di sini, bukan diambil dari `tierCommissions` milik katalog.
 * Kedua daftar itu dibangun oleh dua parser berbeda dengan filter berbeda,
 * salah satunya menerima `http://`, satunya tidak, sehingga indeksnya bisa
 * bergeser dan link yang ditampilkan jadi bukan milik komisi yang dijanjikan.
 */
export type TapLink = {
  url: string;
  brand: string;
  label: string;
  hasSample: boolean;
  expiresAt: string | null;
  commission: number | null;
};

/**
 * Tidak ada pilihan link: yang dipakai selalu tier dengan komisi TERKECIL,
 * yaitu angka yang sudah dijanjikan kartu brand.
 *
 * Seri diputus oleh baris yang lebih dulu muncul di sheet. Bila tidak ada
 * komisi sama sekali. Seperti seluruh brand Shopee - link pertama yang dipakai.
 */
export function pickPrimaryLink(links: readonly TapLink[]): TapLink | null {
  if (!links.length) return null;
  let best: TapLink | null = null;
  for (const link of links) {
    if (link.commission === null) continue;
    if (best === null || link.commission < (best.commission as number)) best = link;
  }
  return best ?? links[0];
}

export async function getTapLinks(campaignId: string) {
  const platform = campaignId.startsWith("shopee-") ? "shopee" : "tiktok";
  const rows = parseCsv(await loadCampaignCsv(platform));
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  const expiryIndex = headers.findIndex((header) => ["berlaku hingga", "end date", "expiry date", "expired at", "campaign end"].includes(header.toLowerCase()));
  if (platform === "shopee") {
    // Format link Shopee: brand dan link affiliate sudah jadi kolom sendiri,
    // satu baris per campaign. Tidak seperti sheet asli yang menggabungkan
    // keduanya dalam satu sel. Terdeteksi lewat "Status Kadaluarsa", supaya
    // sheet asli tidak pernah salah masuk jalur ini.
    if (headers.includes("Brand") && headers.includes("Link") && headers.includes("Status Kadaluarsa")) {
      const brandIndex = headers.indexOf("Brand");
      const linkIndex = headers.indexOf("Link");
      const sampleIndex = headers.indexOf("Punya Sample");
      const matches = rows.filter((row) => `shopee-${slug(row[brandIndex]?.trim() ?? "")}` === campaignId);
      const links: TapLink[] = [];
      for (const row of matches) {
        const brand = row[brandIndex].trim();
        const raw = row[linkIndex]?.trim() ?? "";
        try {
          const url = new URL(raw);
          if (url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) links.push({ url: url.toString(), brand, label: matches.length > 1 ? `Campaign Shopee ${links.length + 1}` : "Campaign Shopee", hasSample: /^(yes|ya)$/i.test(row[sampleIndex]?.trim() ?? ""), expiresAt: expiryIndex >= 0 ? row[expiryIndex]?.trim() || null : null, commission: null });
        } catch { /* abaikan link rusak */ }
      }
      return links;
    }

    const linkIndex = headers.indexOf("Link Campaign Shopee");
    const sampleIndex = headers.indexOf("Brand Open Buat Request Sample");
    // Sheet Shopee tidak punya kolom komisi sama sekali, jadi seluruh linknya
    // bernilai null dan pemilihan jatuh ke link pertama.
    const links: TapLink[] = [];
    for (const row of rows) {
      const raw = row[linkIndex]?.trim() ?? "";
      const urls = extractShopeeUrls(raw);
      if (!urls.length) continue;
      const brand = cleanShopeeBrand(raw, urls[0]);
      if (`shopee-${slug(brand)}` !== campaignId) continue;
      for (const rawUrl of urls) {
        try {
          const url = new URL(rawUrl);
          if (url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) links.push({ url: url.toString(), brand, label: urls.length > 1 ? `Campaign Shopee ${links.length + 1}` : "Campaign Shopee", hasSample: /^(yes|ya)$/i.test(row[sampleIndex]?.trim() ?? ""), expiresAt: expiryIndex >= 0 ? row[expiryIndex]?.trim() || null : null, commission: null });
        } catch { /* abaikan link rusak */ }
      }
    }
    return links;
  }
  const brandIndex = headers.indexOf("Brand");
  // Ekspor terbaru memakai "TAP LINK URL" karena hyperlink harus dimaterialisasi
  // lebih dulu; ekspor lama memakai "TAP LINK".
  const linkIndex = headers.indexOf("TAP LINK URL") >= 0 ? headers.indexOf("TAP LINK URL") : headers.indexOf("TAP LINK");
  const campaignIndex = headers.indexOf("Campaign TAP");
  const noteIndex = headers.indexOf("Note");
  const statusIndex = headers.indexOf("Status TAP Link");
  // Komisi dibaca di sini juga, memakai parser yang sama dengan katalog, supaya
  // link dan angkanya berasal dari satu baris yang sama.
  const commissionIndex = headers.indexOf("CREATOR COMMISSION");
  let currentBrand = "";
  const links: TapLink[] = [];
  for (const row of rows) {
    if (row[brandIndex]?.trim()) currentBrand = row[brandIndex].trim();
    // Slug dibentuk dari nama yang sudah dinormalkan supaya spasi menggantung
    // dan kapitalisasi berbeda tetap menunjuk ke halaman deal yang sama.
    if (brandSlug(currentBrand) !== campaignId) continue;
    if (statusIndex >= 0 && /unavailable|inactive|expired|non.?aktif|tidak aktif/i.test(row[statusIndex]?.trim() ?? "")) continue;
    const raw = row[linkIndex]?.trim() ?? "";
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
        const parsed = parseCommissionCell(commissionIndex >= 0 ? row[commissionIndex] ?? "" : "");
        links.push({
          url: url.toString(),
          brand: currentBrand,
          label: row[campaignIndex]?.trim() || `Campaign ${links.length + 1}`,
          hasSample: /\bsample\b/i.test(`${row[noteIndex] ?? ""} ${row[campaignIndex] ?? ""}`),
          expiresAt: expiryIndex >= 0 ? row[expiryIndex]?.trim() || null : null,
          commission: parsed.ok ? parsed.value : null,
        });
      }
    } catch { /* abaikan link rusak */ }
  }

  return links;
}

/** Link tunggal yang ditawarkan untuk sebuah brand: komisi terkecil. */
export async function getPrimaryTapLink(campaignId: string) {
  return pickPrimaryLink(await getTapLinks(campaignId));
}
