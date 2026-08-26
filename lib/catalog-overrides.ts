import { brandKey, brandSlug } from "./brand-key.ts";
import type { Campaign, CampaignTier } from "./catalog.ts";

/**
 * Lapisan override CMS.
 *
 * Spreadsheet tetap sumber massalnya. Admin tidak menulis balik ke sheet;
 * suntingannya disimpan terpisah dan ditempelkan saat render, sehingga sinkron
 * ulang tidak pernah menghapus perbaikan manual — dan sebaliknya, sebuah
 * override tidak menyembunyikan bahwa sheet-nya masih salah.
 */
export type CampaignOverride = {
  /** Kunci brand dari sheet. Untuk campaign buatan admin, kunci nama barunya. */
  brandKey: string;
  /**
   * Platform pemilik override ini.
   *
   * 94 dari 383 brand Shopee memakai nama yang sama dengan brand TikTok
   * (Anua, Azarine, Cetaphil, CeraVe, Baseus). Tanpa pemisahan ini satu
   * suntingan akan mengenai dua katalog sekaligus.
   *
   * Tidak diisi berarti TikTok, supaya seluruh record yang sudah tersimpan
   * sebelum kolom ini ada tetap terbaca sebagaimana ditulis dulu.
   */
  platform?: OverridePlatform;
  displayName?: string;
  category?: string;
  logo?: string | null;
  hidden?: boolean;
  ended?: boolean;
  /**
   * Tanggal berakhir campaign dalam format dd/mm/yyyy.
   *
   * Workbook tidak punya kolom ini sama sekali, jadi sumbernya adalah CMS.
   * Formatnya mengikuti `classifyExpiry`, satu-satunya bentuk yang diterima.
   */
  validUntil?: string;
  hasSample?: boolean | null;
  /** Menandai brand sebagai SKU baru. Tidak ada di sheet, hanya dari CMS. */
  newSku?: boolean;
  /** Menimpa tier tertentu berdasarkan urutannya di sheet. */
  tiers?: Array<{ index: number; commission?: number | null; tapLink?: string; label?: string }>;
  /** Campaign yang tidak ada di sheet sama sekali. */
  manualTiers?: CampaignTier[];
  /** Menggabungkan brand ini ke brand lain, untuk blok duplikat. */
  mergedInto?: string;
  updatedAt: string;
  updatedBy: string;
};

export type OverridePlatform = "tiktok" | "shopee";

export type OverrideMap = ReadonlyMap<string, CampaignOverride>;

/** Platform sebuah override; record lama tanpa kolom ini tetap berarti TikTok. */
export function overridePlatform(override: CampaignOverride): OverridePlatform {
  return override.platform === "shopee" ? "shopee" : "tiktok";
}

/**
 * Kunci penyimpanan yang sudah dipisah per platform.
 *
 * TikTok sengaja memakai kunci polos, persis seperti sebelumnya, supaya record
 * yang sudah ada di Redis tidak perlu dimigrasi sama sekali.
 */
export function overrideId(platform: OverridePlatform, key: string) {
  return platform === "shopee" ? `shopee:${key}` : key;
}

/**
 * Tanggal di masa lalu yang dipakai saat admin menandai campaign selesai.
 * Memakai jalur kedaluwarsa yang sudah ada berarti badge, urutan, dan status
 * "tidak bisa diklik" langsung ikut benar tanpa aturan baru.
 */
const ENDED_MARKER = "01/01/2000";

/**
 * Menandai selesai secara manual mengalahkan tanggal apa pun; setelah itu
 * tanggal dari CMS, lalu nilai yang datang dari sheet.
 */
function resolveExpiry(override: CampaignOverride, fromSheet: string | null) {
  if (override.ended) return ENDED_MARKER;
  return override.validUntil?.trim() || fromSheet;
}

/** Campaign yang sepenuhnya dibuat admin, tanpa baris di sheet. */
export function manualCampaign(override: CampaignOverride): Campaign {
  const brand = override.displayName ?? override.brandKey;
  const tiers = override.manualTiers ?? [];
  const rates = tiers.map((tier) => tier.commission).filter((rate): rate is number => typeof rate === "number");
  return {
    id: brandSlug(brand),
    brand,
    category: override.category ?? "Lainnya",
    platform: "TikTok Shop",
    commission: rates.length ? Math.min(...rates) : null,
    tierCommissions: tiers.map((tier) => tier.commission),
    campaignCount: tiers.length,
    hasSample: override.hasSample ?? null,
    gmvRank: null,
    updated: override.updatedAt,
    campaign: brand,
    image: override.logo ?? null,
    specialLivePrice: false,
    expiresAt: resolveExpiry(override, null),
    newSku: override.newSku ?? false,
  };
}

/**
 * Menerapkan override ke satu campaign hasil parsing sheet.
 *
 * Mengembalikan `null` bila brand disembunyikan atau digabung ke brand lain,
 * karena keduanya berarti kartu ini tidak boleh berdiri sendiri.
 */
export function applyOverride(campaign: Campaign, override: CampaignOverride | undefined): Campaign | null {
  if (!override) return campaign;
  if (override.hidden || override.mergedInto) return null;

  const brand = override.displayName?.trim() || campaign.brand;
  const patched: Campaign = {
    ...campaign,
    brand,
    id: brandSlug(brand),
    category: override.category?.trim() || campaign.category,
    image: override.logo !== undefined ? override.logo : campaign.image,
    hasSample: override.hasSample !== undefined ? override.hasSample : campaign.hasSample,
    newSku: override.newSku ?? campaign.newSku,
  };

  const edits = override.tiers ?? [];
  const manual = override.manualTiers ?? [];
  if (!edits.length && !manual.length) {
    return { ...patched, expiresAt: resolveExpiry(override, patched.expiresAt) };
  }

  // Suntingan per tier ditumpuk di atas nilai sheet berdasarkan indeks baris,
  // lalu aturan "nilai terkecil" dihitung ulang dari campuran keduanya.
  const rates = [...campaign.tierCommissions];
  for (const edit of edits) {
    if (edit.commission === undefined) continue;
    if (edit.index < 0 || edit.index >= rates.length) continue;
    rates[edit.index] = edit.commission;
  }
  for (const tier of manual) rates.push(tier.commission);

  const usable = rates.filter((rate): rate is number => typeof rate === "number");
  return {
    ...patched,
    commission: usable.length ? Math.min(...usable) : null,
    tierCommissions: rates,
    campaignCount: rates.length,
    expiresAt: resolveExpiry(override, patched.expiresAt),
  };
}

/**
 * Menggabungkan katalog sheet dengan seluruh override, lalu menambahkan
 * campaign buatan admin yang tidak punya padanan di sheet.
 *
 * `platform` menentukan override mana yang ikut dan bagaimana kunci dibentuk,
 * sehingga brand bernama sama di dua platform tidak saling menimpa.
 *
 * `allowManual` mematikan penambahan campaign buatan admin. Shopee memakainya:
 * seluruh campaign manual berbentuk TikTok — punya tier dan komisi — dan kalau
 * ikut ditambahkan, katalog Shopee akan menampilkan brand yang tidak pernah ada
 * di sheet-nya, lengkap dengan angka komisi yang Shopee sendiri tidak punya.
 */
export function mergeCatalog(
  campaigns: readonly Campaign[],
  overrides: OverrideMap,
  options: { platform?: OverridePlatform; allowManual?: boolean } = {},
): Campaign[] {
  const platform = options.platform ?? "tiktok";
  const allowManual = options.allowManual ?? platform === "tiktok";
  const seen = new Set<string>();
  const merged: Campaign[] = [];

  for (const campaign of campaigns) {
    const id = overrideId(platform, brandKey(campaign.brand));
    seen.add(id);
    const patched = applyOverride(campaign, overrides.get(id));
    if (patched) merged.push(patched);
  }

  if (!allowManual) return merged;

  for (const [id, override] of overrides) {
    if (seen.has(id)) continue;
    if (overridePlatform(override) !== platform) continue;
    if (override.hidden || override.mergedInto) continue;
    if (!override.manualTiers?.length) continue;
    merged.push(manualCampaign(override));
  }

  return merged;
}

export function overrideCount(overrides: OverrideMap) {
  return overrides.size;
}

export function isOverridden(brand: string, overrides: OverrideMap, platform: OverridePlatform = "tiktok") {
  return overrides.has(overrideId(platform, brandKey(brand)));
}
