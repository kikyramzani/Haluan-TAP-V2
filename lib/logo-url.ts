/**
 * Penyaring nilai `Brand.logoUrl` sebelum dipakai merender.
 *
 * Kolomnya menampung tiga bentuk sah dari tiga era berbeda: path statis hasil
 * migrasi Fase 2 ("/brand-logos/*.webp"), URL https Vercel Blob hasil unggah
 * admin (lib/image-upload.ts), dan data URL peninggalan CMS lama.
 *
 * Yang membuat penyaring ini perlu: kolom itu juga INPUT TEKS BEBAS di
 * /admin/brand, jadi isinya bisa "brand-logos/x.webp" (tanpa garis miring),
 * "//evil.example/x.png", atau "javascript:...". next/image MELEMPAR untuk
 * sumber yang tidak dikenalinya, dan itu terjadi di dalam Server Component —
 * satu baris rusak menjatuhkan SELURUH /deals, bukan satu kartu. Karena itu
 * fungsi ini mengembalikan null, tidak pernah melempar.
 *
 * Daftar host-nya sengaja hanya di sini dan di next.config.ts. Menyalinnya ke
 * komponen akan membuat keduanya melenceng diam-diam.
 */

/** Sama dengan images.remotePatterns di next.config.ts. Keduanya harus diubah bersama. */
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function normalizeLogoUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) return trimmed;

  /**
   * "//host/x.png" adalah URL protocol-relative, BUKAN path lokal — next/image
   * memperlakukannya sebagai sumber jauh dan melempar karena hostnya tidak
   * terdaftar. Diperiksa sebelum cabang path di bawahnya karena keduanya
   * sama-sama diawali garis miring.
   */
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    return url.hostname.endsWith(BLOB_HOST_SUFFIX) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Versi untuk form admin. normalizeLogoUrl membuang nilai yang tidak sah
 * diam-diam — benar untuk jalur render, salah untuk orang yang baru saja
 * mengetiknya: admin yang menempel "brand-logos/x.webp" tanpa garis miring
 * berhak diberi tahu, bukan dibiarkan menyimpan lalu bertanya-tanya kenapa
 * logonya tidak muncul.
 */
export function validateLogoUrl(value: string | null | undefined): { ok: true; value: string | null } | { ok: false; message: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true, value: null };

  const normalized = normalizeLogoUrl(trimmed);
  if (normalized) return { ok: true, value: normalized };

  return {
    ok: false,
    message: "Logo harus berupa path yang diawali garis miring (/brand-logos/nama.webp) atau URL hasil unggah di field ini.",
  };
}
