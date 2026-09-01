import { brandKey, brandSlug, preferredBrandName } from "./brand-key.ts";
import { classifyExpiry, isActionable } from "./campaign-flags.ts";
import { parseCommissionCell } from "./commission.ts";
import { cleanShopeeBrand, extractShopeeUrls, slug as shopeeSlug } from "./shopee-catalog.ts";

/** Satu baris campaign milik sebuah brand. Satu brand bisa punya banyak tier. */
export type CampaignTier = {
  label: string;
  commission: number | null;
  tapLink: string;
  hasSample: boolean;
};

export type Campaign = {
  id: string;
  brand: string;
  category: string;
  platform: "TikTok Shop" | "Shopee Affiliate";
  /** Komisi yang ditampilkan: nilai TERKECIL dari seluruh tier brand ini. */
  commission: number | null;
  /**
   * Komisi tiap campaign, urut sesuai baris di sheet. Indeksnya sejajar dengan
   * daftar TAP link di endpoint privat. Hanya berisi angka persen, tidak pernah
   * URL partner, sehingga aman ikut ke response publik.
   */
  tierCommissions: Array<number | null>;
  campaignCount: number;
  /** `null` berarti belum diketahui, bukan "tidak ada". UI menyembunyikan badge. */
  hasSample: boolean | null;
  /** Hanya untuk pengurutan internal. Angkanya tidak pernah ditampilkan. */
  gmvRank: number | null;
  updated: string;
  campaign: string;
  image: string | null;
  specialLivePrice: boolean;
  expiresAt: string | null;
  /**
   * Ditandai admin sebagai SKU baru. Sheet tidak punya kolom ini di platform
   * mana pun, jadi satu-satunya sumbernya adalah CMS: parser selalu mengisi
   * `false`, dan hanya override yang bisa menaikkannya.
   */
  newSku: boolean;
  /**
   * Diisi getCampaignCatalog() (lib/catalog-db.ts) dari cron malam
   * CampaignEngagementStat, dan hanya untuk campaign berstatus ACTIVE,
   * bukan dihitung ulang di sini. Baca lewat liveHotBadge()
   * (app/components/HotBadge.tsx), yang juga menyaring tanggal kedaluwarsa,
   * supaya badge di kartu dan hitungan di chip tidak pernah berbeda.
   */
  hotBadge?: "TOP_BRAND" | "TRENDING" | "HIGH_CONVERSION" | "HIGH_DEMAND";
};

export type CatalogIssue = {
  row: number;
  brand: string;
  field: "CREATOR COMMISSION" | "TAP LINK";
  value: string;
  reason: string;
};

export function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Header worksheet tidak konsisten antar ekspor: kolom kategori pernah bernama
 * "Category" dan pernah hanya berisi tiga spasi, dan kolom link bisa "TAP LINK"
 * atau "TAP LINK URL" setelah hyperlink dimaterialisasi. Pencarian dibuat
 * toleran supaya satu perubahan judul kolom tidak mengosongkan katalog.
 */
function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate.trim().toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function categoryName(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "beauty" || clean.includes("health")) return "Beauty & Health";
  if (clean === "3c") return "Tech";
  if (clean === "hla") return "Home & Living";
  if (clean === "f&b" || clean === "fmcg") return "Food & FMCG";
  if (clean.includes("mom")) return "Mom & Baby";
  if (clean === "fashion") return "Fashion";
  return "Lainnya";
}

function expiryColumn(headers: string[]) {
  return findColumn(headers, ["berlaku hingga", "end date", "expiry date", "expired at", "campaign end"]);
}

/**
 * Format ringkasan: satu CSV memuat TikTok dan Shopee sekaligus lewat kolom
 * "Platform", dengan komisi yang sudah menjadi angka terkecil per brand,
 * bukan satu baris per tier mentah seperti sheet asli. Dipakai saat sumber
 * datanya bukan sheet operasional TAP, tapi rekap yang sudah dirapikan.
 *
 * Terdeteksi lewat tiga kolom yang tidak pernah ada di sheet asli manapun,
 * supaya perubahan header sheet asli tidak pernah salah terbaca sebagai
 * format ini.
 */
const SUMMARY_HEADER_MARKERS = ["Komisi (%)", "Jumlah Tier", "SKU Baru"];

function isSummaryFormat(headers: string[]) {
  const normalized = headers.map((header) => header.trim().replace(/^\uFEFF/, ""));
  return SUMMARY_HEADER_MARKERS.every((marker) => normalized.includes(marker));
}

/**
 * Format link Shopee: khusus Shopee, satu baris per campaign, dengan brand
 * dan link affiliate sudah jadi kolom sendiri-sendiri. Beda dengan sheet
 * asli yang menggabungkan keduanya dalam satu sel ("Brand : url").
 *
 * Terdeteksi lewat "Status Kadaluarsa", kolom yang tidak pernah ada di sheet
 * asli maupun format ringkasan, supaya ketiganya tidak pernah tertukar.
 */
const SHOPEE_LINK_HEADER_MARKERS = ["Brand", "Link", "Status Kadaluarsa"];

function isShopeeLinkFormat(headers: string[]) {
  const normalized = headers.map((header) => header.trim().replace(/^\uFEFF/, ""));
  return SHOPEE_LINK_HEADER_MARKERS.every((marker) => normalized.includes(marker));
}

/**
 * Satu brand yang muncul di beberapa baris berarti brand itu punya lebih
 * dari satu link/campaign. Sample dan harga live khusus digabung lewat OR,
 * supaya satu baris yang bilang "Ya" tidak pernah kalah oleh baris lain yang
 * kosong untuk brand yang sama.
 */
function buildShopeeLinkCampaigns(csv: string): Campaign[] {
  const rows = parseCsv(csv);
  const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) ?? [];
  const iBrand = headers.indexOf("Brand");
  const iCategory = headers.indexOf("Kategori");
  const iLink = headers.indexOf("Link");
  const iSample = headers.indexOf("Punya Sample");
  const iSpecialLive = headers.indexOf("Special Live Price");
  const iExpiry = headers.indexOf("Berlaku Hingga");
  const iNewSku = headers.indexOf("SKU Baru");

  const groups = new Map<string, Campaign>();

  for (const row of rows) {
    const cell = (position: number) => (position >= 0 ? row[position]?.trim() ?? "" : "");
    const brand = cell(iBrand);
    const link = cell(iLink);
    if (!brand || !/^https:\/\//i.test(link)) continue;

    const id = `shopee-${shopeeSlug(brand)}`;
    const existing = groups.get(id) ?? {
      id, brand, category: cell(iCategory) || "Lainnya", platform: "Shopee Affiliate" as const,
      commission: null, tierCommissions: [], campaignCount: 0, hasSample: false as boolean | null, gmvRank: null,
      updated: "", campaign: brand, image: null, specialLivePrice: false, expiresAt: null,
      newSku: false,
    };
    existing.campaignCount += 1;
    existing.hasSample = Boolean(existing.hasSample) || yesNo(cell(iSample)) === true;
    existing.specialLivePrice ||= yesNo(cell(iSpecialLive)) === true;
    existing.expiresAt ||= cell(iExpiry) || null;
    existing.newSku ||= yesNo(cell(iNewSku)) === true;
    groups.set(id, existing);
  }

  return [...groups.values()].sort(
    (a, b) =>
      Number(Boolean(b.hasSample)) - Number(Boolean(a.hasSample)) ||
      Number(b.specialLivePrice) - Number(a.specialLivePrice) ||
      a.brand.localeCompare(b.brand),
  );
}

/** "Ya"/"Tidak" jadi boolean; kosong tetap `null`, bukan berarti "Tidak". */
function yesNo(value: string): boolean | null {
  const clean = value.trim().toLowerCase();
  if (clean === "ya" || clean === "yes") return true;
  if (clean === "tidak" || clean === "no") return false;
  return null;
}

/**
 * Format ringkasan tidak punya kolom link affiliate sama sekali, jadi setiap
 * campaign lahir tanpa TAP link. Itu tidak membuat brand hilang dari katalog,
 * baru terlihat saat creator membuka detail brand dan link belum tersedia
 * (jalur yang sama dengan link yang gagal dimuat karena sebab lain).
 */
function buildSummaryCampaigns(csv: string): { tiktok: Campaign[]; shopee: Campaign[] } {
  const rows = parseCsv(csv);
  const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, "")) ?? [];
  const iPlatform = headers.indexOf("Platform");
  const iBrand = headers.indexOf("Brand");
  const iCategory = headers.indexOf("Kategori");
  const iCommission = headers.indexOf("Komisi (%)");
  const iTiers = headers.indexOf("Jumlah Tier");
  const iSample = headers.indexOf("Punya Sample");
  const iExpiry = headers.indexOf("Berlaku Hingga");
  const iNewSku = headers.indexOf("SKU Baru");
  const iSpecialLive = headers.indexOf("Special Live Price");

  const tiktok: Campaign[] = [];
  const shopee: Campaign[] = [];

  for (const row of rows) {
    const cell = (position: number) => (position >= 0 ? row[position]?.trim() ?? "" : "");
    const brand = cell(iBrand);
    if (!brand) continue;

    const commissionRaw = cell(iCommission);
    const commission = commissionRaw && Number.isFinite(Number(commissionRaw)) ? Number(commissionRaw) : null;
    const campaignCount = Math.max(1, Number(cell(iTiers)) || 1);
    const isShopee = cell(iPlatform) === "Shopee Affiliate";

    const campaign: Campaign = {
      id: isShopee ? `shopee-${shopeeSlug(brand)}` : brandSlug(brand),
      brand,
      category: cell(iCategory) || "Lainnya",
      platform: isShopee ? "Shopee Affiliate" : "TikTok Shop",
      commission,
      // Hanya angka gabungan yang diketahui, bukan pecahan per tier. Mengisi
      // seluruh array dengan angka yang sama akan mengklaim tahu sesuatu yang
      // sebetulnya tidak diketahui.
      tierCommissions: [commission],
      campaignCount,
      hasSample: yesNo(cell(iSample)),
      gmvRank: null,
      updated: "",
      campaign: brand,
      image: null,
      specialLivePrice: yesNo(cell(iSpecialLive)) === true,
      expiresAt: cell(iExpiry) || null,
      newSku: yesNo(cell(iNewSku)) === true,
    };

    if (isShopee) shopee.push(campaign);
    else tiktok.push(campaign);
  }

  return { tiktok: tiktok.sort(compareCampaigns), shopee: shopee.sort(compareCampaigns) };
}

const INACTIVE_STATUS = /unavailable|inactive|expired|non.?aktif|tidak aktif/i;

/** Catatan sample di kolom bebas. Sengaja sempit supaya "required" tidak ikut cocok. */
const SAMPLE_NOTE = /\bsample\b/i;

type BrandMetric = { hasSample: boolean | null; gmvRank: number | null };

/**
 * Katalog tidak mengimpor modul metrik supaya tidak ada ketergantungan
 * melingkar. Pemanggil yang menyambungkan keduanya.
 */
export type MetricResolver = (brand: string) => BrandMetric | undefined;

type BrandGroup = {
  names: string[];
  category: string;
  tiers: CampaignTier[];
  noteSample: boolean;
  updated: string;
  campaign: string;
  image: string;
  expiresAt: string;
};

export function buildCampaignCatalog(csv: string, resolveMetric?: MetricResolver) {
  const peekRows = parseCsv(csv);
  if (isSummaryFormat(peekRows[0] ?? [])) {
    return { campaigns: buildSummaryCampaigns(csv).tiktok, issues: [] };
  }

  const rows = parseCsv(csv);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];

  const brandIndex = findColumn(headers, ["Brand"]);
  const creatorIndex = findColumn(headers, ["CREATOR COMMISSION"]);
  const linkIndex = findColumn(headers, ["TAP LINK URL", "TAP LINK"]);
  const statusIndex = findColumn(headers, ["Status TAP Link"]);
  const updateIndex = findColumn(headers, ["Last Update"]);
  const campaignIndex = findColumn(headers, ["Campaign TAP"]);
  const noteIndex = findColumn(headers, ["Note"]);
  const imageIndex = findColumn(headers, ["Image URL", "Campaign Image", "Product Image"]);
  const expiryIndex = expiryColumn(headers);

  // Worksheet terbaru memberi kolom kategori judul berisi tiga spasi, sehingga
  // tidak bisa dicari lewat nama. Kolom tepat di kanan Brand adalah cadangannya.
  const namedCategory = findColumn(headers, ["Category", "Kategori"]);
  const categoryIndex = namedCategory >= 0 ? namedCategory : brandIndex >= 0 ? brandIndex + 1 : -1;

  const issues: CatalogIssue[] = [];
  const groups = new Map<string, BrandGroup>();

  // Sel yang di-merge di spreadsheet diekspor sebagai sel kosong, jadi nilai
  // terakhir diteruskan ke bawah sampai muncul nilai baru.
  let currentBrand = "";
  let currentCategory = "";

  rows.forEach((row, index) => {
    const cell = (position: number) => (position >= 0 ? row[position]?.trim() ?? "" : "");
    if (cell(brandIndex)) currentBrand = cell(brandIndex);
    if (cell(categoryIndex)) currentCategory = cell(categoryIndex);
    // Kolom brand sesekali berisi URL karena salah tempel. Itu bukan nama brand.
    if (!currentBrand || /^https?:\/\//i.test(currentBrand)) return;

    const status = cell(statusIndex);
    if (INACTIVE_STATUS.test(status)) return;

    const link = cell(linkIndex);
    if (!/^https?:\/\//i.test(link)) {
      if (link) issues.push({ row: index + 2, brand: currentBrand, field: "TAP LINK", value: link, reason: "not_a_url" });
      return;
    }

    const rawCommission = cell(creatorIndex);
    const parsed = parseCommissionCell(rawCommission);
    if (!parsed.ok && rawCommission) {
      issues.push({ row: index + 2, brand: currentBrand, field: "CREATOR COMMISSION", value: rawCommission, reason: parsed.reason });
    }

    const key = brandKey(currentBrand);
    const group = groups.get(key) ?? {
      names: [], category: currentCategory, tiers: [], noteSample: false,
      updated: "", campaign: "", image: "", expiresAt: "",
    };
    group.names.push(currentBrand);
    if (!group.category && currentCategory) group.category = currentCategory;

    const label = cell(campaignIndex) || `Campaign ${group.tiers.length + 1}`;
    const tierSample = SAMPLE_NOTE.test(`${cell(noteIndex)} ${cell(campaignIndex)}`);
    group.tiers.push({ label, commission: parsed.ok ? parsed.value : null, tapLink: link, hasSample: tierSample });
    group.noteSample ||= tierSample;
    group.updated ||= cell(updateIndex);
    group.campaign ||= cell(campaignIndex);
    const image = cell(imageIndex);
    if (!group.image && /^https:\/\//i.test(image)) group.image = image;
    group.expiresAt ||= cell(expiryIndex);
    groups.set(key, group);
  });

  const campaigns: Campaign[] = [...groups.values()].map((group): Campaign => {
    const brand = preferredBrandName(group.names);
    const metric = resolveMetric?.(brand);
    // Sheet metrik adalah sumber utama status sample. Catatan di kolom bebas
    // hanya dipakai bila brand tidak punya baris di sheet itu.
    const hasSample = metric?.hasSample ?? (group.noteSample ? true : null);
    const rates = group.tiers.map((tier) => tier.commission).filter((rate): rate is number => rate !== null);
    return {
      id: brandSlug(brand),
      brand,
      category: categoryName(group.category),
      platform: "TikTok Shop",
      commission: rates.length ? Math.min(...rates) : null,
      tierCommissions: group.tiers.map((tier) => tier.commission),
      campaignCount: group.tiers.length,
      hasSample,
      gmvRank: metric?.gmvRank ?? null,
      updated: group.updated,
      campaign: group.campaign,
      image: group.image || null,
      specialLivePrice: false,
      expiresAt: group.expiresAt || null,
      newSku: false,
    };
  }).sort(compareCampaigns);

  // Brand dengan link valid tetap ditampilkan walau komisinya belum terbaca.
  // Angkanya dirender sebagai "-", bukan ditebak atau disembunyikan.
  return { campaigns, issues };
}

/**
 * Urutan bawaan "Rekomendasi": campaign yang sudah berakhir selalu turun ke
 * bawah, lalu peringkat GMV internal, komisi, dan abjad.
 *
 * Aturan kedaluwarsa ikut di sini, bukan hanya di pengurutan sisi klien, supaya
 * halaman yang dirender server pun tidak pernah menaruh campaign mati di atas.
 */
/** Urutan yang sama dipakai cron saat menentukan badge (satu badge per campaign). */
const BADGE_PRIORITY: Record<NonNullable<Campaign["hotBadge"]>, number> = {
  TOP_BRAND: 0,
  TRENDING: 1,
  HIGH_CONVERSION: 2,
  HIGH_DEMAND: 3,
};

export function compareCampaigns(a: Campaign, b: Campaign) {
  const endedRank = Number(!isActionable(classifyExpiry(a.expiresAt))) - Number(!isActionable(classifyExpiry(b.expiresAt)));
  if (endedRank) return endedRank;

  // Deal populer memimpin katalog. Ini pengganti jujur untuk baris "Paling
  // populer" yang dihapus: tanpa kontrol baru, dan campaign berakhir tetap di
  // bawah karena tingkat di atas sudah menyaringnya lebih dulu.
  const badgeRank = (item: Campaign) => (item.hotBadge ? BADGE_PRIORITY[item.hotBadge] : 9);
  const hotRank = badgeRank(a) - badgeRank(b);
  if (hotRank) return hotRank;

  if (a.gmvRank !== b.gmvRank) {
    if (a.gmvRank === null) return 1;
    if (b.gmvRank === null) return -1;
    return a.gmvRank - b.gmvRank;
  }
  return (b.commission ?? 0) - (a.commission ?? 0) || a.brand.localeCompare(b.brand);
}

function shopeeCategory(value: string) {
  const clean = value.trim().toLowerCase();
  if (clean === "beauty" || clean === "perfume") return "Beauty & Health";
  if (clean === "elektronik") return "Tech";
  if (clean === "home living") return "Home & Living";
  if (clean === "fnb") return "Food & FMCG";
  if (clean === "mom and baby") return "Mom & Baby";
  if (clean === "sports") return "Sports";
  if (clean === "fashion") return "Fashion";
  return "Lainnya";
}

export function buildShopeeCampaigns(csv: string): Campaign[] {
  const peekRows = parseCsv(csv);
  if (isShopeeLinkFormat(peekRows[0] ?? [])) {
    return buildShopeeLinkCampaigns(csv);
  }
  if (isSummaryFormat(peekRows[0] ?? [])) {
    return buildSummaryCampaigns(csv).shopee;
  }

  const rows = parseCsv(csv);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  const categoryIndex = findColumn(headers, ["Category"]);
  const linkIndex = findColumn(headers, ["Link Campaign Shopee"]);
  const sampleIndex = findColumn(headers, ["Brand Open Buat Request Sample"]);
  const specialLiveIndex = findColumn(headers, ["Brand Open Buat Request Harga Special Live"]);
  const expiryIndex = expiryColumn(headers);

  let currentCategory = "";
  const groups = new Map<string, Campaign>();

  for (const row of rows) {
    const cell = (position: number) => (position >= 0 ? row[position]?.trim() ?? "" : "");
    if (cell(categoryIndex)) currentCategory = cell(categoryIndex);
    const raw = cell(linkIndex);
    const urls = extractShopeeUrls(raw);
    if (!urls.length) continue;
    const brand = cleanShopeeBrand(raw, urls[0]);
    if (!brand) continue;

    const id = `shopee-${shopeeSlug(brand)}`;
    const existing = groups.get(id) ?? {
      id, brand, category: shopeeCategory(currentCategory), platform: "Shopee Affiliate" as const,
      commission: null, tierCommissions: [], campaignCount: 0, hasSample: false as boolean | null, gmvRank: null,
      updated: "", campaign: brand, image: null, specialLivePrice: false, expiresAt: null,
      newSku: false,
    };
    existing.campaignCount += urls.length;
    existing.hasSample = Boolean(existing.hasSample) || /^(yes|ya)$/i.test(cell(sampleIndex));
    existing.specialLivePrice ||= /^(yes|ya)$/i.test(cell(specialLiveIndex));
    existing.expiresAt ||= cell(expiryIndex) || null;
    groups.set(id, existing);
  }

  return [...groups.values()].sort(
    (a, b) =>
      Number(Boolean(b.hasSample)) - Number(Boolean(a.hasSample)) ||
      Number(b.specialLivePrice) - Number(a.specialLivePrice) ||
      a.brand.localeCompare(b.brand),
  );
}
