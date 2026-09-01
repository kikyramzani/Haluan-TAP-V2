import { brandMetricsKey } from "./brand-key.ts";
import { parseCsv } from "./catalog.ts";

/**
 * Metrik per brand dari worksheet "GMV Campaign Brand".
 *
 * Dua hal diambil dari sana: status sample support (kolom boolean 0/1) dan GMV
 * TAP bulan berjalan. Angka GMV adalah data komersial internal, jadi nilainya
 * tidak pernah keluar dari modul ini. Yang diekspor hanya peringkat relatif
 * untuk mengurutkan katalog.
 */
export type BrandMetric = {
  hasSample: boolean | null;
  gmvRank: number | null;
};

const SAMPLE_HEADERS = ["Sample support", "Sample Support"];
const BRAND_HEADERS = ["Row Labels", "Brand", "Nama Brand"];
const GMV_HEADERS = ["GMV TAP"];

function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate.trim().toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Baris header sheet ini tidak di baris pertama. Ada baris banner bulan dan
 * baris TOTAL di atasnya. Baris header dicari dari isinya, bukan posisinya.
 */
function locateHeaderRow(rows: string[][]) {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    if (findColumn(rows[index], SAMPLE_HEADERS) >= 0 && findColumn(rows[index], BRAND_HEADERS) >= 0) {
      return index;
    }
  }
  return -1;
}

function parseFlag(value: string): boolean | null {
  const clean = value.trim().toLowerCase();
  if (!clean) return null;
  if (["1", "1.0", "yes", "ya", "true", "available", "tersedia"].includes(clean)) return true;
  if (["0", "0.0", "no", "tidak", "false", "-"].includes(clean)) return false;
  return null;
}

function parseGmv(value: string): number | null {
  const clean = value.replace(/[^0-9]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildBrandMetrics(csv: string): Map<string, BrandMetric> {
  const rows = parseCsv(csv);
  const headerRow = locateHeaderRow(rows);
  const metrics = new Map<string, BrandMetric>();
  if (headerRow < 0) return metrics;

  const headers = rows[headerRow];
  const brandIndex = findColumn(headers, BRAND_HEADERS);
  const sampleIndex = findColumn(headers, SAMPLE_HEADERS);
  const gmvIndex = findColumn(headers, GMV_HEADERS);

  const gmvByKey = new Map<string, number>();

  for (const row of rows.slice(headerRow + 1)) {
    const cell = (position: number) => (position >= 0 ? row[position]?.trim() ?? "" : "");
    const brand = cell(brandIndex);
    // Sheet ini berbentuk pivot, banyak baris tanpa nama brand. Lewati saja.
    if (!brand || /^(grand )?total$/i.test(brand)) continue;

    const key = brandMetricsKey(brand);
    if (!key) continue;

    const sample = parseFlag(cell(sampleIndex));
    const existing = metrics.get(key);
    metrics.set(key, {
      hasSample: sample ?? existing?.hasSample ?? null,
      gmvRank: null,
    });

    const gmv = parseGmv(cell(gmvIndex));
    if (gmv !== null) gmvByKey.set(key, Math.max(gmvByKey.get(key) ?? 0, gmv));
  }

  // Peringkat 1 adalah GMV tertinggi. Nilai rupiahnya sengaja dibuang di sini
  // supaya tidak ada jalur yang bisa membocorkannya ke response publik.
  const ranked = [...gmvByKey.entries()].sort((a, b) => b[1] - a[1]);
  ranked.forEach(([key], index) => {
    const metric = metrics.get(key);
    if (metric) metric.gmvRank = index + 1;
  });

  return metrics;
}

/** Kunci terpendek yang masih aman dipakai sebagai awalan saat mencocokkan brand. */
const MIN_PREFIX_LENGTH = 5;

/**
 * Mencocokkan brand katalog dengan baris sheet metrik.
 *
 * Kecocokan persis dicoba lebih dulu. Bila gagal, awalan dipakai sebagai
 * cadangan karena sheet metrik memakai handle toko yang lebih panjang
 * ("Oraimo" vs "oraimoaudiolab", "Kime" vs "kimeskincare"). Awalan hanya
 * diterima bila hasilnya tunggal. Begitu ada dua kandidat, brand dianggap
 * tidak cocok daripada salah tempel ke brand lain.
 */
export function lookupBrandMetric(brand: string, metrics: ReadonlyMap<string, BrandMetric>) {
  const key = brandMetricsKey(brand);
  if (!key) return undefined;

  const exact = metrics.get(key);
  if (exact) return exact;
  if (key.length < MIN_PREFIX_LENGTH) return undefined;

  let found: BrandMetric | undefined;
  for (const [candidate, metric] of metrics) {
    const matches = candidate.startsWith(key) || (candidate.length >= MIN_PREFIX_LENGTH && key.startsWith(candidate));
    if (!matches) continue;
    if (found) return undefined;
    found = metric;
  }
  return found;
}
