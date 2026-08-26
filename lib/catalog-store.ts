import { brandKey } from "./brand-key.ts";
import { getJson, getJsonMany, key, redis, setJson } from "./redis.ts";
import { bumpCollectionRevision } from "./filter-cache.ts";
import { overrideId, overridePlatform } from "./catalog-overrides.ts";
import type { CampaignOverride, OverridePlatform } from "./catalog-overrides.ts";

/**
 * Penyimpanan override CMS di Redis.
 *
 * Setiap override adalah satu record per brand, ditambah satu indeks agar
 * seluruhnya bisa dibaca dalam sekali jalan saat merender katalog.
 */
/**
 * Indeksnya sorted set, sama seperti indeks lain di aplikasi ini, dengan waktu
 * sunting sebagai skor — jadi daftarnya sekaligus terurut dari yang paling baru
 * diubah.
 */
const INDEX = key("catalog-overrides");
/**
 * `id` di sini sudah bernamespace platform lewat `overrideId`, jadi tidak boleh
 * dinormalisasi ulang: `brandKey` membuang tanda titik dua dan akan mengubah
 * "shopee:anua" menjadi "shopeeanua", memutus hubungan record dengan indeksnya.
 */
const record = (id: string) => key("catalog-override", id);
const scopedId = (brand: string, platform: OverridePlatform) => overrideId(platform, brandKey(brand));
const MAX_OVERRIDES = 2000;

/** Kuncinya adalah id bernamespace, bentuk yang sama dengan yang dicari `mergeCatalog`. */
export async function listOverrides(): Promise<Map<string, CampaignOverride>> {
  const ids = await redis<string[]>("ZREVRANGE", INDEX, 0, MAX_OVERRIDES - 1);
  if (!ids?.length) return new Map();
  const items = await getJsonMany<CampaignOverride>(ids.map(record));
  return new Map(items.map((item) => [scopedId(item.brandKey, overridePlatform(item)), item]));
}

/** Dipakai saat merender katalog. Gagal membaca override tidak boleh mematikan katalog. */
export async function safeListOverrides(): Promise<Map<string, CampaignOverride>> {
  try {
    return await listOverrides();
  } catch {
    return new Map();
  }
}

export async function getOverride(brand: string, platform: OverridePlatform = "tiktok") {
  return getJson<CampaignOverride>(record(scopedId(brand, platform)));
}

export async function saveOverride(input: Omit<CampaignOverride, "updatedAt">) {
  const override: CampaignOverride = { ...input, updatedAt: new Date().toISOString() };
  const id = scopedId(override.brandKey, overridePlatform(override));
  await Promise.all([
    setJson(record(id), override),
    redis("ZADD", INDEX, Date.now(), id),
  ]);
  await bumpCollectionRevision("catalog-overrides");
  return override;
}

/** Mengembalikan brand ke nilai sheet apa adanya. */
export async function deleteOverride(brand: string, platform: OverridePlatform = "tiktok") {
  const id = scopedId(brand, platform);
  await Promise.all([redis("DEL", record(id)), redis("ZREM", INDEX, id)]);
  await bumpCollectionRevision("catalog-overrides");
}
