/**
 * Parser komisi creator.
 *
 * Sumbernya satu kolom spreadsheet yang menyimpan dua encoding berbeda:
 * sel numerik adalah fraksi (0.09 berarti 9%), sel teks membawa simbol persen
 * ("9-10%"). Salah membaca salah satunya membuat seluruh angka publik salah,
 * jadi parser ini menolak nilai ambigu alih-alih menebak.
 */

const MIN_RATE = 0;
const MAX_RATE = 100;

export type ParsedCommission = { ok: true; value: number } | { ok: false; reason: CommissionReject };

export type CommissionReject =
  | "empty"
  | "unrecognized"
  | "ambiguous_separator"
  | "descending_range"
  | "out_of_range";

const reject = (reason: CommissionReject): ParsedCommission => ({ ok: false, reason });

/** Menghapus penanda versi campaign ("2.0", "(3.0)") yang bukan bagian dari angka komisi. */
function stripVersionMarkers(value: string) {
  return value
    .replace(/\(\s*[23][.,]0\s*\)/g, " ")
    .replace(/(^|[\s(])[23][.,]0(?=$|[\s)])/g, "$1 ");
}

/** Membuang kualifikasi dalam kurung yang tidak memuat angka, misal "(khusus top)". */
function stripQualifiers(value: string) {
  return value.replace(/\([^)]*\)/g, (match) => (/\d/.test(match) ? match : " "));
}

/**
 * Menormalkan koma. Koma dipakai sebagai desimal Indonesia ("7,5%") sekaligus
 * sebagai pemisah tier ("10,11,12%"), jadi keputusannya dibuat eksplisit:
 * dua koma atau lebih pasti daftar tier, satu koma dengan satu digit di
 * belakangnya adalah desimal, dan "0," selalu desimal. Sisanya ambigu.
 */
function normalizeCommas(value: string): { text: string } | { ambiguous: true } {
  const commas = (value.match(/,/g) ?? []).length;
  if (commas === 0) return { text: value };
  if (commas >= 2) return { text: value.replace(/,/g, " - ") };

  const single = value.match(/(\d+)\s*,\s*(\d+)/);
  if (!single) return { text: value.replace(/,/g, " - ") };
  if (single[1] === "0" || single[2].length === 1) return { text: value.replace(/,/g, ".") };
  return { ambiguous: true };
}

function numbersIn(value: string) {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

export function parseCommissionCell(input: string): ParsedCommission {
  const raw = (input ?? "").trim();
  if (!raw || raw === "-" || raw === "–") return reject("empty");

  const cleaned = stripQualifiers(stripVersionMarkers(raw)).trim();
  if (!cleaned) return reject("empty");

  const hasPercent = cleaned.includes("%");
  const normalized = normalizeCommas(cleaned);
  if ("ambiguous" in normalized) return reject("ambiguous_separator");

  const values = numbersIn(normalized.text);
  if (!values.length) return reject("unrecognized");

  // Rentang atau daftar tier harus menaik. "10-1%" hampir pasti salah ketik
  // "10-11%", dan memakai 1% sebagai batas bawah akan menyesatkan creator.
  const ascending = values.every((value, index) => index === 0 || value >= values[index - 1]);
  if (values.length > 1 && !ascending) return reject("descending_range");

  const lowest = values[0];

  // Tanpa simbol persen, desimal di bawah 1 adalah fraksi (0.09 → 9%).
  // Bilangan bulat sudah dalam satuan persen (12 → 12%).
  const percent = !hasPercent && lowest < 1 ? lowest * 100 : lowest;
  const rounded = Number(percent.toFixed(2));

  if (rounded <= MIN_RATE || rounded > MAX_RATE) return reject("out_of_range");
  return { ok: true, value: rounded };
}

/** Komisi yang ditampilkan per brand adalah nilai terkecil dari seluruh tier-nya. */
export function minCommission(cells: readonly string[]): number | null {
  const values = cells
    .map((cell) => parseCommissionCell(cell))
    .filter((parsed): parsed is { ok: true; value: number } => parsed.ok)
    .map((parsed) => parsed.value);
  return values.length ? Math.min(...values) : null;
}

export function formatCommission(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${String(Number(value.toFixed(2))).replace(".", ",")}%`;
}
