/**
 * Identitas brand.
 *
 * Spreadsheet menulis brand yang sama dengan beberapa cara: spasi menggantung
 * ("MS Glow "), kapitalisasi berbeda ("AOYAMA" vs "Aoyama"), dan tanda baca
 * berbeda ("Jim's Honey Indonesia" vs "Jims.Honey (INDONESIA)"). Sheet metrik
 * bahkan memakai ejaan lain lagi ("Skintificid" untuk "Skintific").
 *
 * Ada dua tingkat kunci:
 * - `brandKey` menentukan identitas katalog. Ketat, hanya menyamakan varian
 *   penulisan dari nama yang sama.
 * - `brandMetricsKey` hanya dipakai untuk menggabungkan sheet metrik. Lebih
 *   longgar karena sheet itu menempelkan sufiks negara atau toko.
 */

/**
 * Sheet metrik memakai handle toko, bukan nama brand, dan sufiksnya bisa
 * bertumpuk ("usmile Indonesia Official Shop"). Diurutkan dari yang terpanjang
 * supaya "indonesia" dibuang lebih dulu daripada "indo" atau "id".
 */
const METRICS_SUFFIXES = ["indonesia", "official", "store", "shop", "indo", "idn", "ind", "id"];
const MIN_STEM_LENGTH = 4;

/** Kunci identitas katalog: casefold dan buang seluruh karakter non-alfanumerik. */
export function brandKey(name: string) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Kunci penggabungan sheet metrik. Sufiks hanya dibuang bila sisa batangnya
 * masih cukup panjang, supaya brand pendek tidak salah gabung.
 */
/**
 * Katalog menempelkan keterangan pada nama brand. "Tavi (Paragon)",
 * "Aerostreet (Shirt)", "Avoskin new list", sedangkan sheet metrik memakai
 * nama polos. Keterangan itu dibuang sebelum kunci dibentuk.
 */
function stripDescriptors(name: string) {
  return (name ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bnew\s+list\b/gi, " ")
    .trim();
}

export function brandMetricsKey(name: string) {
  let key = brandKey(stripDescriptors(name) || name);
  let stripping = true;
  while (stripping) {
    stripping = false;
    for (const suffix of METRICS_SUFFIXES) {
      if (key.endsWith(suffix) && key.length - suffix.length >= MIN_STEM_LENGTH) {
        key = key.slice(0, -suffix.length);
        stripping = true;
        break;
      }
    }
  }
  return key;
}

/** Slug URL untuk /deal/{id}. Stabil terhadap spasi menggantung dan kapitalisasi. */
export function brandSlug(name: string) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Membersihkan spasi ganda dan spasi menggantung tanpa mengubah ejaan brand. */
export function normalizeBrandName(name: string) {
  return (name ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Memilih ejaan yang ditampilkan ketika satu brand muncul dengan beberapa
 * varian. Varian dengan kapitalisasi campuran dimenangkan karena "Aoyama"
 * lebih mudah dibaca daripada "AOYAMA", lalu yang paling sering muncul.
 */
export function preferredBrandName(variants: readonly string[]) {
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const clean = normalizeBrandName(variant);
    if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  if (!counts.size) return "";

  const mixedCase = (value: string) => value !== value.toUpperCase() && value !== value.toLowerCase();
  return [...counts.entries()].sort((a, b) => {
    const caseRank = Number(mixedCase(b[0])) - Number(mixedCase(a[0]));
    if (caseRank) return caseRank;
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  })[0][0];
}
