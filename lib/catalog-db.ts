import { unstable_cache } from "next/cache";
import { prisma } from "./db.ts";
import { compareCampaigns } from "./catalog.ts";
import type { Campaign } from "./catalog.ts";
import { pickPrimaryLink, type TapLink } from "./campaign-links.ts";
import { minMaxCommission } from "./commission-display.ts";
import { normalizeLogoUrl } from "./logo-url.ts";
import type { Platform as PrismaPlatform } from "@prisma/client";

/**
 * Postgres-backed replacement for lib/campaign-links.ts's public catalog
 * reads (Phase 2 of the rebuild plan. See
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
 * conversionRatePct, dst.) tidak ikut terbaca tiap kali katalog dimuat, dan
 * tidak ikut terkirim lewat /api/campaigns, yang menyerialkan Campaign[] apa
 * adanya.
 */
/**
 * TANPA `links`. Ini pemangkasan egress terbesar di seluruh aplikasi.
 *
 * `campaignInclude` di atas membawa relasi `links` karena halaman /deal/[slug]
 * dan getTapLinks memang membutuhkannya. Katalog TIDAK: `toCampaign` di bawah
 * tidak pernah menyentuh `row.links` satu kali pun — URL afiliasi bahkan
 * dilarang keluar ke permukaan publik, dan ada tes yang menjaganya.
 *
 * Jadi setiap pemuatan katalog dulu menarik SETIAP URL afiliasi milik ~780
 * campaign dari Neon, melintasi jaringan, lalu membuangnya. Beranda memanggil
 * katalog dua kali per kunjungan, /deals dua kali lagi, dan /api/campaigns
 * sekali lagi.
 */
const catalogInclude = {
  brand: { include: { category: true } },
  tiers: { orderBy: { sortIndex: "asc" as const } },
  engagementStat: { select: { badge: true } },
};

/**
 * Diketik terhadap catalogInclude (TANPA links), bukan campaignInclude.
 *
 * toCampaign tidak pernah membaca row.links, jadi menuntutnya di tipe parameter
 * akan memaksa setiap pemanggil ikut menariknya. Baris dari campaignInclude —
 * yang MEMANG punya links — tetap bisa diteruskan ke sini: properti tambahan
 * sah untuk tipe non-literal.
 */
type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findFirst<{ include: typeof catalogInclude }>>>;

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
    // No brand-metrics sheet was migrated (none was available at Phase 2 -
    // see the plan's progress log), so GMV-based ranking is unavailable;
    // compareCampaigns() already treats a null gmvRank as "sort last by that
    // key", falling through to commission/alphabetical.
    gmvRank: null,
    updated: row.updatedAt.toISOString(),
    campaign: row.brand.displayName,
    /**
     * Dulu dipaku `null` dengan alasan kolom Image URL di sheet kosong untuk
     * 100% brand saat migrasi. Alasan itu kedaluwarsa sejak /admin/brand punya
     * jalur unggahnya sendiri: logo yang diganti admin memang tersimpan di
     * Brand.logoUrl, tapi tidak pernah dibaca siapa pun, sehingga kartu publik
     * selamanya menampilkan aset lokal yang dicocokkan lewat NAMA brand
     * (app/brand-assets.ts). Mengganti logo di CMS tidak mengubah apa pun.
     *
     * normalizeLogoUrl, bukan nilai mentahnya: kolom ini input teks bebas, dan
     * nilai yang tidak bisa dirender next/image harus jatuh ke null di sini —
     * kalau dibiarkan lewat, ia melempar di tengah render dan menjatuhkan
     * seluruh katalog.
     */
    image: normalizeLogoUrl(row.brand.logoUrl),
    specialLivePrice: row.specialLivePrice,
    expiresAt: toSheetDate(row.validUntil),
    newSku: row.newSku,
    // Gerbang pertama: status. Katalog memakai `status: { not: "HIDDEN" }`
    // sehingga campaign ENDED ikut tampil, dan campaign yang sudah berakhir
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

async function readCampaignCatalog(platform: "tiktok" | "shopee"): Promise<Campaign[]> {
  const rows = await prisma.campaign.findMany({
    where: { platform: toPrismaPlatform(platform), status: { not: "HIDDEN" } },
    include: catalogInclude,
  });
  return rows.map(toCampaign).sort(compareCampaigns);
}

/**
 * Umur cache katalog dalam detik. 0 mematikannya sepenuhnya.
 *
 * Ada sebagai env, bukan konstanta, karena harness e2e MEMBUTUHKANNYA mati:
 * tests/e2e/catalog-badges.spec.ts menyemai satu campaign di beforeAll lalu
 * langsung membuka /deals dan menuntut campaign itu terlihat. Katalog yang
 * di-cache akan menyajikan versi sebelum semaian dan tesnya gagal — bukan
 * karena produknya rusak, melainkan karena tesnya lebih cepat dari cache.
 */
const CATALOG_CACHE_TTL = Number(process.env.CATALOG_CACHE_TTL ?? 300);

/**
 * Ditulis sekali di sini lalu diimpor aksi admin yang perlu membatalkannya
 * (brand, campaign, tier). Sebelumnya string ini hanya ada di opsi
 * unstable_cache di bawah dan tidak ada satu pun yang membatalkannya — lihat
 * komentar "Konsekuensinya jujur" di sana.
 */
export const CAMPAIGN_CATALOG_TAG = "campaign-catalog";

/**
 * Katalog di-CACHE. Ini pengurangan pembacaan database terbesar di aplikasi.
 *
 * Tanpa cache, satu kunjungan beranda menarik katalog DUA kali (TikTok dan
 * Shopee), /deals dua kali lagi, /api/campaigns sekali, dan sitemap dua kali —
 * masing-masing ~390 baris beserta brand, kategori, dan tier-nya. Katalog itu
 * sendiri hanya berubah ketika admin menyuntingnya, mungkin beberapa kali
 * sehari; menariknya ulang untuk setiap pengunjung adalah lalu lintas yang
 * dibayar tanpa mendapat apa pun.
 *
 * unstable_cache, bukan `use cache`: direktif itu menuntut cacheComponents
 * aktif di next.config.ts, dan menyalakannya mengubah semantik caching seluruh
 * aplikasi — perubahan yang jauh lebih besar dari yang dibutuhkan di sini.
 *
 * Batas lima menit itu dulu berlaku tanpa jalan keluar. Sekarang aksi admin
 * yang mengubah isi katalog memanggil updateTag(CAMPAIGN_CATALOG_TAG), jadi
 * TTL ini kembali ke peran aslinya: jaring pengaman untuk perubahan yang
 * datang dari luar CMS (SQL langsung, cron), bukan penentu kapan suntingan
 * admin terlihat.
 */
export async function getCampaignCatalog(platform: "tiktok" | "shopee"): Promise<Campaign[]> {
  if (CATALOG_CACHE_TTL <= 0) return readCampaignCatalog(platform);
  const cached = unstable_cache(readCampaignCatalog, [CAMPAIGN_CATALOG_TAG, platform], {
    revalidate: CATALOG_CACHE_TTL,
    tags: [CAMPAIGN_CATALOG_TAG],
  });
  return cached(platform);
}

/**
 * Hanya JUMLAH brand, bukan katalognya.
 *
 * /daftar sebelumnya memanggil getCampaignCatalog("tiktok") lalu membaca
 * `.length` — menarik ~390 baris beserta brand, kategori, tier, dan (sebelum
 * perbaikan di atas) seluruh URL afiliasinya, melintasi jaringan, hanya untuk
 * mendapatkan satu bilangan bulat. COUNT dikerjakan Postgres dan yang melintas
 * hanya angkanya.
 */
export async function getCampaignBrandCount(platform: "tiktok" | "shopee"): Promise<number> {
  return prisma.campaign.count({
    where: { platform: toPrismaPlatform(platform), status: { not: "HIDDEN" } },
  });
}

/**
 * `links[i]` dan `tiers[i]` dipasangkan lewat POSISI, bukan foreign key —
 * tidak ada kolom yang menghubungkan CampaignLink ke CampaignTier. Yang
 * menjaga pasangannya tetap benar adalah satu-satunya dua penulis yang ada:
 * saveCampaignTiers() menulis tier dan link dalam satu gelung dengan sortIndex
 * yang sama, dan editor /admin/campaign/[id] membacanya kembali dengan zip
 * yang sama. Kalau suatu saat muncul penulis ketiga (SQL langsung, importer
 * baru), yang harus menyusul adalah kolom FK-nya — bukan komentar ini.
 */
export async function getTapLinks(campaignId: string): Promise<TapLink[]> {
  const row = await prisma.campaign.findUnique({ where: { slug: campaignId }, include: campaignInclude });
  if (!row || row.status === "HIDDEN") return [];
  const expiresAt = toSheetDate(row.validUntil);
  return row.links.map((link, index) => ({
    id: link.id,
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
