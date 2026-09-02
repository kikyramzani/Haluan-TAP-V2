import {
  WORDMARK_HEIGHT,
  WORDMARK_HOT,
  WORDMARK_HOT_FROM,
  WORDMARK_HOT_TO,
  WORDMARK_INK,
  WORDMARK_RATIO,
  WORDMARK_TOP,
  WORDMARK_VIEWBOX,
} from "./brand-logo-paths";

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
 * Dua perlakuan warna, dua sumber berbeda:
 *
 * - "Haluan" memakai `currentColor`, jadi ia mengikuti tinta halaman dan
 *   berbalik sendiri antara tema terang dan gelap.
 * - "TAP" memakai gradasi magenta ke violet yang SAMA dengan marka
 *   aplikasinya, lewat --wordmark-from dan --wordmark-to. Kedua token itu
 *   berpasangan per tema; alasannya ada di tokens.css.
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
      <defs>
        {/**
         * Gradasinya diberikan ke SATU bidang persegi, lalu bidang itu dipotong
         * mengikuti bentuk hurufnya. Bukan diberikan langsung ke tiap huruf.
         *
         * Alasannya nyata, bukan preferensi. Tiap glyph dirender dengan
         * `transform="translate(x)"` sendiri, dan transform itu membuat ruang
         * koordinat baru. Gradasi yang menempel pada glyph — mau
         * userSpaceOnUse maupun objectBoundingBox — ikut tergeser bersama
         * transform-nya, sehingga T, A, dan P masing-masing menyapu
         * sendiri-sendiri. Diukur langsung: ketiganya keluar dengan warna yang
         * sama persis, yaitu ujung awal gradasinya.
         *
         * Persegi di bawah ini tidak punya transform sama sekali, jadi
         * gradasinya diselesaikan tepat satu kali, membentang dari huruf T
         * sampai huruf P.
         */}
        <linearGradient id="haluan-tap-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--wordmark-from)" />
          <stop offset="1" stopColor="var(--wordmark-to)" />
        </linearGradient>
        <clipPath id="haluan-tap-letters">
          {WORDMARK_HOT.map((glyph) => (
            <path key={`clip-${glyph.x}-${glyph.d.length}`} d={glyph.d} transform={`translate(${glyph.x})`} />
          ))}
        </clipPath>
      </defs>

      <g fill="currentColor">
        {WORDMARK_INK.map((glyph) => (
          <path key={`ink-${glyph.x}-${glyph.d.length}`} d={glyph.d} transform={`translate(${glyph.x})`} />
        ))}
      </g>
      <rect
        clipPath="url(#haluan-tap-letters)"
        x={WORDMARK_HOT_FROM}
        y={WORDMARK_TOP}
        width={WORDMARK_HOT_TO - WORDMARK_HOT_FROM}
        height={WORDMARK_HEIGHT}
        fill="url(#haluan-tap-sweep)"
      />
    </svg>
  );
}
