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

/** Tinggi render bawaan. Lihat .brand-logo di layout.css untuk ukuran nyatanya. */
const HEIGHT = 34;

/**
 * Logo Haluan TAP.
 *
 * Huruf kecil, mengikuti kesan Upwork dan Fiverr: keduanya wordmark huruf kecil
 * yang membulat dan ramah, tanpa marka terpisah. Detail khasnya ada pada huruf
 * "t" di kata "tap", yang palangnya memanjang menembus kedua sisinya.
 *
 * Outline, bukan teks hidup: sebuah logo tidak boleh berubah bentuk kalau
 * webfont gagal dimuat. Path-nya dihasilkan sekali oleh scripts/build-brand.mjs;
 * jangan menyunting brand-logo-paths.ts dengan tangan.
 *
 * Dua perlakuan warna, dua sumber berbeda:
 *
 * - "haluan" memakai `currentColor`, jadi ia mengikuti tinta halaman dan
 *   berbalik sendiri antara tema terang dan gelap.
 * - "tap" memakai gradasi magenta ke violet yang sama dengan marka aplikasinya,
 *   lewat --wordmark-from dan --wordmark-to. Kedua token itu berpasangan per
 *   tema; alasannya ada di tokens.css.
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
         * Offset tiap huruf memang sudah dipanggang ke dalam data path-nya oleh
         * build, jadi tidak ada transform per huruf yang bisa menggeser gradasi.
         * Bidang tunggal ini tetap cara paling aman: satu elemen, satu sapuan,
         * tidak peduli berapa banyak path yang membentuk katanya.
         */}
        <linearGradient id="haluan-tap-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--wordmark-from)" />
          <stop offset="1" stopColor="var(--wordmark-to)" />
        </linearGradient>
        <clipPath id="haluan-tap-letters">
          {WORDMARK_HOT.map((d) => (
            <path key={`clip-${d.length}-${d.slice(0, 12)}`} d={d} />
          ))}
        </clipPath>
      </defs>

      <g fill="currentColor">
        {WORDMARK_INK.map((d) => (
          <path key={`ink-${d.length}-${d.slice(0, 12)}`} d={d} />
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
