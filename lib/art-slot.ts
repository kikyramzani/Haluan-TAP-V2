import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Slot aset untuk ilustrasi halaman publik.
 *
 * Menggeneralisasi pola yang sudah dipakai app/components/HeroVisual.tsx: cari
 * berkas di public/, pakai kalau ada, kembalikan null kalau belum. Yang memanggil
 * bertanggung jawab menyediakan fallback. Di sini fallback-nya selalu vektor
 * <Illustration>, jadi tidak pernah ada gambar rusak maupun kotak kosong.
 *
 * Hanya boleh dipanggil dari Server Component: `node:fs` tidak ada di browser.
 * Halaman yang berupa Client Component memanggilnya di server parent-nya dan
 * mengoper hasilnya sebagai prop (lihat app/request-sample/page.tsx).
 *
 * Urutan ekstensi mengikuti HeroVisual: format modern lebih dulu, JPEG terakhir.
 */
const CANDIDATES = ["png", "webp", "avif", "jpg"] as const;

export function resolveArt(name: string): string | null {
  for (const extension of CANDIDATES) {
    const file = `/art/${name}.${extension}`;
    if (existsSync(join(process.cwd(), "public", file))) return file;
  }
  return null;
}
