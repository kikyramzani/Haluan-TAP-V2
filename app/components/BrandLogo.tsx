import { WORDMARK_HOT, WORDMARK_INK, WORDMARK_RATIO, WORDMARK_VIEWBOX } from "./brand-logo-paths";

/** Tinggi render bawaan, sama dengan tinggi wordmark lama di header. */
const HEIGHT = 30;

/**
 * Logo Haluan TAP.
 *
 * Outline, bukan teks hidup: sebuah logo tidak boleh berubah bentuk kalau
 * webfont gagal dimuat, dan huruf A yang digambar ulang harus menyatu dengan
 * metrik Poppins alih-alih menebaknya. Path-nya dihasilkan sekali oleh
 * scripts/build-brand.mjs; jangan menyunting brand-logo-paths.ts dengan tangan.
 *
 * Dua warna, dua sumber berbeda:
 *
 * - "Haluan" memakai `currentColor`, jadi ia mengikuti tinta halaman dan
 *   berbalik sendiri antara tema terang dan gelap.
 * - "TAP" memakai `--brand-wordmark`, pasangan magenta yang sadar tema. Satu
 *   magenta untuk dua tema tidak mungkin: `--cta` cukup untuk isian berlabel
 *   putih, tapi sebagai TEKS di atas ink ia hanya sekitar 3,6.
 *
 * `aria-hidden` disengaja. Setiap tautan yang memuat logo ini sudah membawa
 * `aria-label="Haluan TAP, ke beranda"`; memberi SVG-nya nama sendiri hanya
 * membuat pembaca layar menyebut nama yang sama dua kali.
 */
export default function BrandLogo() {
  return (
    <svg
      className="brand-logo"
      viewBox={WORDMARK_VIEWBOX}
      width={Math.round(HEIGHT * WORDMARK_RATIO)}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        {WORDMARK_INK.map((glyph) => (
          <path key={`ink-${glyph.x}-${glyph.d.length}`} d={glyph.d} transform={`translate(${glyph.x})`} />
        ))}
      </g>
      <g fill="var(--brand-wordmark)">
        {WORDMARK_HOT.map((glyph) => (
          <path key={`hot-${glyph.x}-${glyph.d.length}`} d={glyph.d} transform={`translate(${glyph.x})`} />
        ))}
      </g>
    </svg>
  );
}
