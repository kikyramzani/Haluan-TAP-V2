/**
 * Membangun Logo Haluan TAP: wordmark, favicon, dan ikon aplikasi.
 *
 *   node scripts/build-brand.mjs
 *
 * Sekali jalan, hasilnya di-commit. Skrip ini menutup celah lama: keempat PNG
 * ikon selama ini dibuat di luar repo tanpa jejak yang bisa diulang, padahal
 * BRAND-SYSTEM.md §10 menyatakan keempatnya "diregenerasi dari" favicon.svg.
 *
 * Outline huruf di GLYPHS diambil dari Poppins Bold (SIL OFL 1.1) memakai
 * fontTools, sekali, lalu disalin ke sini sebagai data. Sengaja tidak diturunkan
 * ulang dari berkas font setiap build: sebuah logo adalah aset tetap, bukan
 * hasil render yang boleh bergeser kalau versi font-nya berubah. Sumber dan
 * lisensinya dicatat di BRAND-LOGO-SOURCES.md.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");

/* ── Metrik Poppins Bold ─────────────────────────────────────────────── */

const UPEM = 1000;
const CAP = 702;

/**
 * Path sudah dibalik ke sumbu SVG (y ke bawah), baseline di y=0, puncak
 * kapital di y=-702. `adv` adalah advance width asli, jadi jarak antarhurufnya
 * tetap jarak yang dirancang perancang font-nya.
 */
const GLYPHS = {
  H: { adv: 731, d: "M670 -702V0H499V-289H233V0H62V-702H233V-427H499V-702Z" },
  a: {
    adv: 679,
    d: "M274 -566Q333 -566 377.5 -542.0Q422 -518 446 -479V-558H617V0H446V-79Q421 -40 376.5 -16.0Q332 8 273 8Q205 8 149.0 -27.5Q93 -63 60.5 -128.5Q28 -194 28 -280Q28 -366 60.5 -431.0Q93 -496 149.0 -531.0Q205 -566 274 -566ZM324 -417Q273 -417 237.5 -380.5Q202 -344 202 -280Q202 -216 237.5 -178.5Q273 -141 324 -141Q375 -141 410.5 -178.0Q446 -215 446 -279Q446 -343 410.5 -380.0Q375 -417 324 -417Z",
  },
  l: { adv: 295, d: "M233 -740V0H62V-740Z" },
  u: {
    adv: 674,
    d: "M613 -558V0H442V-76Q416 -39 371.5 -16.5Q327 6 273 6Q209 6 160.0 -22.5Q111 -51 84.0 -105.0Q57 -159 57 -232V-558H227V-255Q227 -199 256.0 -168.0Q285 -137 334 -137Q384 -137 413.0 -168.0Q442 -199 442 -255V-558Z",
  },
  n: {
    adv: 674,
    d: "M617 -326V0H447V-303Q447 -359 418.0 -390.0Q389 -421 340 -421Q291 -421 262.0 -390.0Q233 -359 233 -303V0H62V-558H233V-484Q259 -521 303.0 -542.5Q347 -564 402 -564Q500 -564 558.5 -500.5Q617 -437 617 -326Z",
  },
  T: { adv: 591, d: "M567 -702V-565H381V0H210V-565H24V-702Z" },
  A: { adv: 737, d: "M499 -124H237L195 0H16L270 -702H468L722 0H541ZM455 -256 368 -513 282 -256Z" },
  P: {
    adv: 624,
    d: "M339 -252H233V0H62V-702H339Q423 -702 481.0 -673.0Q539 -644 568.0 -593.0Q597 -542 597 -476Q597 -415 569.0 -364.5Q541 -314 483.0 -283.0Q425 -252 339 -252ZM423 -476Q423 -518 399.0 -541.0Q375 -564 326 -564H233V-388H326Q375 -388 399.0 -411.0Q423 -434 423 -476Z",
  },
};

/**
 * Huruf A digambar ulang, dan hanya huruf A.
 *
 * Bentuk dasarnya tetap A Poppins, lengkap dengan rongga dan palangnya, supaya
 * ia tidak pernah berhenti terbaca sebagai huruf A. Yang diubah satu hal:
 * palangnya dipanjangkan ke kiri dan kanan sampai selebar tapak hurufnya, jadi
 * ia menembus kedua kaki alih-alih berhenti di dalamnya.
 *
 * Percobaan pertama membuang palang itu sama sekali dan menggantinya dengan rel
 * di baseline. Dua hal langsung rusak: rel itu memberi T sebuah palang bawah
 * sehingga terbaca "I", dan A tanpa palang terbaca "Δ". Palang yang menembus
 * mempertahankan kedua huruf dan tetap jadi detail yang jelas milik TAP.
 *
 * Advance-nya tetap 737, sama dengan A asli, jadi jarak ke T dan P tidak perlu
 * ditebak ulang.
 */
const A_ADV = 737;
const A_BASE_L = 16;
const A_BASE_R = 722;
const A_APEX_L = 270;
const A_APEX_R = 468;
/** Ketebalan kaki, diukur mendatar. Lebih ramping dari A Poppins asli supaya
 *  rongganya tetap terlihat sampai 16px di bilah tab. */
const A_LEG = 150;
/** Batang: tinggi, posisi atas, dan seberapa jauh ia melewati kedua kaki. */
const A_BAR_H = 138;
const A_BAR_TOP = -262;
const A_BAR_OVERHANG = 34;

/**
 * Kaki A tanpa palang bawaannya: rongga segitiga sengaja dibiarkan TERBUKA ke
 * bawah. Batang di lapisan berikutnya yang menutupnya, jadi batang itulah
 * palangnya.
 */
function aChevron() {
  const innerL = A_BASE_L + A_LEG;
  const innerR = A_BASE_R - A_LEG;
  const slope = (A_APEX_L - A_BASE_L) / CAP;
  const meetY = -(innerR - innerL) / (2 * slope);
  return (
    `M${A_BASE_L} 0L${A_APEX_L} -${CAP}H${A_APEX_R}L${A_BASE_R} 0Z` +
    `M${innerL} 0L${innerR} 0L${(innerL + innerR) / 2} ${meetY.toFixed(1)}Z`
  );
}

/** Batang berujung bulat yang menembus kedua kaki. */
function aBar() {
  const x = A_BASE_L - A_BAR_OVERHANG;
  const w = A_BASE_R - A_BASE_L + A_BAR_OVERHANG * 2;
  const r = A_BAR_H / 2;
  return (
    `M${x + r} ${A_BAR_TOP}h${w - A_BAR_H}` +
    `a${r} ${r} 0 0 1 0 ${A_BAR_H}` +
    `h-${w - A_BAR_H}` +
    `a${r} ${r} 0 0 1 0 -${A_BAR_H}z`
  );
}

/* ── Perakitan wordmark ──────────────────────────────────────────────── */

/** §4.2: Poppins geometris terasa renggang di ukuran display. */
const TRACKING = -0.02 * UPEM;

function layout(word, startX) {
  let x = startX;
  const parts = [];
  for (const ch of word) {
    // Huruf A dirender sebagai DUA path terpisah, sama persis dengan marka
    // aplikasinya: chevron berongga terbuka, lalu batang yang menutup
    // rongganya. Terpisah, bukan satu path gabungan, supaya arah putaran
    // kontur tidak pernah bisa melubangi kaki hurufnya lewat aturan nonzero.
    const ds = ch === "A" ? [aChevron(), aBar()] : [GLYPHS[ch].d];
    parts.push({ ch, x, ds });
    // Ujung batang A menonjol 34 unit melewati kaki kanannya, jadi advance
    // aslinya menyisakan jarak terlalu rapat ke P. Ruangnya dikembalikan di
    // sini, bukan dengan memendekkan batangnya, karena tonjolan itu justru
    // detail yang membedakan huruf ini.
    x += (ch === "A" ? A_ADV + A_BAR_OVERHANG : GLYPHS[ch].adv) + TRACKING;
  }
  return { parts, end: x - TRACKING };
}

function buildWordmark() {
  const haluan = layout("Haluan", 0);
  // Jeda antarkata lebih lebar dari spasi biasa: dua warna yang berdampingan
  // butuh ruang bernapas supaya tidak terbaca sebagai satu kata.
  const tap = layout("TAP", haluan.end + 300);

  const flatten = (parts) =>
    parts.flatMap((p) => p.ds.map((d) => ({ d, x: Math.round(p.x) })));

  return {
    ink: flatten(haluan.parts),
    hot: flatten(tap.parts),
    // Batas kiri dan kanan kata TAP dalam ruang viewBox. Komponennya memakai
    // ini sebagai kotak bidang bergradasi yang lalu dipotong bentuk hurufnya.
    // Gradasi tidak bisa ditempelkan langsung ke tiap huruf: setiap glyph
    // punya transform sendiri, dan transform membuat ruang koordinat baru,
    // sehingga sapuannya ikut tergeser dan tiap huruf menyapu sendiri-sendiri.
    hotFrom: Math.round(tap.parts[0].x + A_BASE_L),
    hotTo: Math.round(tap.end),
    width: Math.round(tap.end),
    // Batas atas: ascender huruf l (-740). Batas bawah: overshoot lengkung
    // huruf a dan u yang turun 8 unit di bawah baseline. Tanpa ruang itu
    // keduanya terpotong tipis di sisi bawah.
    top: -740,
    bottom: 12,
  };
}

/* ── Marka aplikasi ──────────────────────────────────────────────────── */

/**
 * Chevron huruf A yang sama, dibulatkan dan diberi dua bidang bertumpuk,
 * mengikuti kosakata set ikon Google Workspace: bentuk geometris mengapung,
 * gradasi lembut, dan nada ketiga yang muncul di persilangan.
 *
 * Dua perhentian, bukan tiga. Versi favicon sebelumnya membuang gradasi tiga
 * warna karena "tiga perhentian dalam 16px tidak pernah terbaca sebagai
 * gradasi, hanya jadi bubur keabuan". Dua perhentian dalam rona bertetangga
 * tidak punya masalah itu: di 16px ia terbaca sebagai satu bidang magenta, dan
 * siluetnya yang menanggung pengenalan.
 */
/**
 * Marka aplikasi: huruf A yang sama persis dengan yang ada di wordmark, hanya
 * diperbesar dan diberi dua warna.
 *
 * Sudutnya dibulatkan lewat `stroke-linejoin: round` pada path yang juga
 * di-fill, jadi tidak ada satu pun titik yang perlu dihitung ulang. Itu juga
 * yang membuat bentuknya di ikon dan di wordmark tidak akan pernah menyimpang.
 */
function buildMark({ background = null, mono = null } = {}) {
  const S = 512;
  const pad = 62;
  const box = S - pad * 2;

  // Kotak sebenarnya termasuk ujung batang yang menonjol keluar kedua kaki.
  const artL = A_BASE_L - A_BAR_OVERHANG;
  const artW = A_BASE_R - A_BASE_L + A_BAR_OVERHANG * 2;
  const scale = Math.min(box / artW, box / CAP);
  const tx = pad + (box - artW * scale) / 2 - artL * scale;
  const ty = pad + (box + CAP * scale) / 2;
  const place = `transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})"`;

  // Pembulatan sudut. Dinaikkan dari 30 ke 46: radius di set Google Workspace
  // jauh lebih murah hati, dan pada 30 sudut chevron-nya masih terbaca tajam.
  // Dibagi skala supaya lebarnya tetap sama berapa pun ukuran kanvasnya.
  const soften = `stroke-width="${(46 / scale).toFixed(1)}" stroke-linejoin="round"`;

  if (mono) {
    // Android meratakan badge notifikasi jadi siluet, jadi tidak ada gradasi
    // dan tidak ada transparansi parsial yang bisa bertahan di sana.
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
      `<g ${place} fill="${mono}">`,
      `<path d="${aChevron()}" stroke="${mono}" ${soften}/>`,
      `<path d="${aBar()}"/>`,
      `</g></svg>`,
    ].join("");
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
    `<defs><linearGradient id="hot" x1="0.1" y1="0" x2="0.9" y2="1">`,
    // Kedua ujung --gradient-hot (BRAND-SYSTEM.md §3.1).
    `<stop offset="0" stop-color="#fb007f"/><stop offset="1" stop-color="#d226c7"/>`,
    `</linearGradient></defs>`,
    background ? `<rect width="${S}" height="${S}" fill="${background}"/>` : "",
    `<g ${place}>`,
    `<path d="${aChevron()}" fill="url(#hot)" stroke="url(#hot)" ${soften}/>`,
    /**
     * Bidang kedua. Ia mengerjakan dua hal sekaligus: menutup rongga huruf A
     * supaya hurufnya terbaca, dan memunculkan nada ketiga di tempat ia
     * menyilang kedua kaki. Itu perangkat yang sama dipakai Google Drive,
     * Chat, dan Voice.
     *
     * #ff5cb8, bukan #ff209d seperti sebelumnya. Magenta terang di atas
     * chevron yang juga magenta hampir tidak menghasilkan beda nada sama
     * sekali; pink yang lebih pucat memunculkannya dengan jelas. Tetap cukup
     * jenuh untuk terlihat di atas latar terang, karena ujungnya yang menonjol
     * keluar kaki harus tetap ada di sana.
     */
    `<path d="${aBar()}" fill="#ff5cb8" opacity="0.9"/>`,
    `</g></svg>`,
  ].join("");
}

/* ── Keluaran ────────────────────────────────────────────────────────── */

const wordmark = buildWordmark();

const OUTPUTS = [
  { file: "favicon.svg", svg: buildMark() },
  { file: "icon-192.png", svg: buildMark(), size: 192 },
  { file: "icon-512.png", svg: buildMark(), size: 512 },
  { file: "icon-maskable-512.png", svg: buildMark({ background: "#fcfcfc" }), size: 512, flatten: true },
  { file: "apple-icon.png", svg: buildMark({ background: "#fcfcfc" }), size: 180, flatten: true },
  { file: "icon-badge-96.png", svg: buildMark({ mono: "#ffffff" }), size: 96 },
];

async function main() {
  mkdirSync(PUBLIC, { recursive: true });

  for (const out of OUTPUTS) {
    const target = resolve(PUBLIC, out.file);
    if (!out.size) {
      writeFileSync(target, `${out.svg}\n`);
      console.log(`  ${out.file}`);
      continue;
    }
    let pipeline = sharp(Buffer.from(out.svg), { density: 384 }).resize(out.size, out.size);
    if (out.flatten) pipeline = pipeline.flatten({ background: "#fcfcfc" });
    await pipeline.png({ compressionLevel: 9 }).toFile(target);
    console.log(`  ${out.file} (${out.size}px)`);
  }

  const height = wordmark.bottom - wordmark.top;
  const glyphs = (list) =>
    `[\n${list.map((g) => `  { d: ${JSON.stringify(g.d)}, x: ${g.x} },`).join("\n")}\n]`;

  writeFileSync(
    resolve(ROOT, "app/components/brand-logo-paths.ts"),
    [
      "// DIHASILKAN scripts/build-brand.mjs. Jangan disunting tangan.",
      "// Outline Poppins Bold (SIL OFL 1.1) plus huruf A yang digambar ulang.",
      "// Lihat BRAND-LOGO-SOURCES.md untuk sumber dan lisensinya.",
      "",
      "export type BrandGlyph = { readonly d: string; readonly x: number };",
      "",
      `export const WORDMARK_VIEWBOX = "0 ${wordmark.top} ${wordmark.width} ${height}";`,
      `export const WORDMARK_RATIO = ${(wordmark.width / height).toFixed(4)};`,
      "",
      "/** Kotak kata \"TAP\", tempat bidang gradasinya digambar lalu dipotong. */",
      `export const WORDMARK_HOT_FROM = ${wordmark.hotFrom};`,
      `export const WORDMARK_HOT_TO = ${wordmark.hotTo};`,
      `export const WORDMARK_TOP = ${wordmark.top};`,
      `export const WORDMARK_HEIGHT = ${height};`,
      "",
      "/** Kata \"Haluan\": mengikuti tinta halaman lewat currentColor. */",
      `export const WORDMARK_INK: readonly BrandGlyph[] = ${glyphs(wordmark.ink)};`,
      "",
      "/** Kata \"TAP\": dipotong dari bidang bergradasi, lihat --wordmark-from/to. */",
      `export const WORDMARK_HOT: readonly BrandGlyph[] = ${glyphs(wordmark.hot)};`,
      "",
    ].join("\n"),
  );
  console.log("  app/components/brand-logo-paths.ts");

  /**
   * Marka di halaman offline ditulis ulang dari marka yang sama.
   *
   * Sebelumnya ia salinan tangan, dan salinan tangan pasti menyimpang: tidak
   * ada satu pun tes yang memeriksa apakah keduanya masih sama. Halaman itu
   * harus memuat marka-nya INLINE karena ia justru dipakai ketika jaringan
   * mati, jadi ia tidak bisa sekadar menunjuk ke favicon.svg.
   */
  const offlinePath = resolve(PUBLIC, "offline.html");
  const inline = buildMark()
    .replace("<svg xmlns", '<svg class="mark" aria-hidden="true" focusable="false" xmlns')
    .replace(' width="512" height="512"', "");
  const offline = readFileSync(offlinePath, "utf8");
  const markPattern = / {6}<svg class="mark"[\s\S]*?<\/svg>\n/;
  // Yang diperiksa POLANYA, bukan apakah isinya berubah. Build yang idempoten
  // memang menghasilkan berkas yang identik, dan itu bukan kegagalan.
  if (!markPattern.test(offline)) throw new Error("Marka di public/offline.html tidak ditemukan");
  writeFileSync(offlinePath, offline.replace(markPattern, `      ${inline}\n`));
  console.log("  public/offline.html (marka inline)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
