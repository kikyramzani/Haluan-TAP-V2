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
  h: { adv: 674, d: "M617 -326V0H447V-303Q447 -359 418.0 -390.0Q389 -421 340 -421Q291 -421 262.0 -390.0Q233 -359 233 -303V0H62V-740H233V-483Q259 -520 304.0 -542.0Q349 -564 405 -564Q501 -564 559.0 -500.5Q617 -437 617 -326Z" },
  t: { adv: 406, d: "M373 -145V0H286Q193 0 141.0 -45.5Q89 -91 89 -194V-416H21V-558H89V-694H260V-558H372V-416H260V-192Q260 -167 272.0 -156.0Q284 -145 312 -145Z" },
  p: {
    adv: 679,
    d: "M405 -566Q474 -566 530.0 -531.0Q586 -496 618.5 -431.0Q651 -366 651 -280Q651 -194 618.5 -128.5Q586 -63 530.0 -27.5Q474 8 405 8Q347 8 302.5 -16.0Q258 -40 233 -78V266H62V-558H233V-479Q258 -518 302.0 -542.0Q346 -566 405 -566ZM354 -417Q303 -417 267.5 -380.0Q232 -343 232 -279Q232 -215 267.5 -178.0Q303 -141 354 -141Q405 -141 441.0 -178.5Q477 -216 477 -280Q477 -344 441.5 -380.5Q406 -417 354 -417Z",
  },
  T: { adv: 591, d: "M567 -702V-565H381V0H210V-565H24V-702Z" },
  A: { adv: 737, d: "M499 -124H237L195 0H16L270 -702H468L722 0H541ZM455 -256 368 -513 282 -256Z" },
  P: {
    adv: 624,
    d: "M339 -252H233V0H62V-702H339Q423 -702 481.0 -673.0Q539 -644 568.0 -593.0Q597 -542 597 -476Q597 -415 569.0 -364.5Q541 -314 483.0 -283.0Q425 -252 339 -252ZM423 -476Q423 -518 399.0 -541.0Q375 -564 326 -564H233V-388H326Q375 -388 399.0 -411.0Q423 -434 423 -476Z",
  },
};

/* ── Perakitan wordmark ──────────────────────────────────────────────── */

/** §4.2: Poppins geometris terasa renggang di ukuran display. */
const TRACKING = -0.02 * UPEM;

/**
 * Menggeser seluruh koordinat X sebuah path, alih-alih memakai
 * `transform="translate(x)"`.
 *
 * Ini bukan gaya penulisan, melainkan syarat supaya gradasinya benar. Transform
 * membuat ruang koordinat baru, jadi gradasi yang dirujuk sebuah path ikut
 * tergeser bersama transform-nya, dan tiap huruf berakhir menyapu
 * sendiri-sendiri. Dengan offset dipanggang ke dalam path, ketiga huruf berbagi
 * satu ruang koordinat dan gradasinya diselesaikan tepat satu kali.
 *
 * Perintah huruf besar bersifat absolut dan X-nya digeser; V hanya membawa Y,
 * dan seluruh perintah huruf kecil bersifat relatif, jadi keduanya dilewati.
 */
function translatePath(d, dx) {
  if (!dx) return d;
  return d.replace(/([A-Za-z])([^A-Za-z]*)/g, (_, cmd, args) => {
    const raw = args.trim();
    if (!raw) return cmd;
    const nums = raw.split(/[\s,]+/).map(Number);
    if (cmd === "H") {
      for (let i = 0; i < nums.length; i += 1) nums[i] += dx;
    } else if (cmd === "M" || cmd === "L" || cmd === "T" || cmd === "Q" || cmd === "C" || cmd === "S") {
      for (let i = 0; i < nums.length; i += 2) nums[i] += dx;
    }
    return cmd + nums.join(" ");
  });
}

/**
 * Huruf "t" pada kata "tap" membawa detail khasnya.
 *
 * Wordmark pindah ke huruf kecil, dan huruf "a" kecil di Poppins berbentuk
 * lingkaran bertangkai — palang yang dulu menembus kedua kaki huruf A kapital
 * tidak punya tempat di sana. Menembus lingkaran "a" pun bukan jawaban: hasilnya
 * terbaca seperti huruf "e".
 *
 * Huruf "t" justru SUDAH punya palang. Memanjangkannya ke kiri dan kanan adalah
 * gerak yang persis sama dengan versi kapitalnya, pada satu-satunya huruf yang
 * tidak kehilangan apa pun karenanya: "t" berpalang panjang tetap "t".
 */
const T_BAR_TOP = -558;
const T_BAR_H = 142;
const T_BAR_OVERHANG = 60;
const T_INK_L = 21;
const T_INK_R = 372;

function tBar() {
  const x = T_INK_L - T_BAR_OVERHANG;
  const w = T_INK_R - T_INK_L + T_BAR_OVERHANG * 2;
  const r = T_BAR_H / 2;
  return (
    `M${x + r} ${T_BAR_TOP}h${w - T_BAR_H}` +
    `a${r} ${r} 0 0 1 0 ${T_BAR_H}` +
    `h-${w - T_BAR_H}` +
    `a${r} ${r} 0 0 1 0 -${T_BAR_H}z`
  );
}

/**
 * Merangkai sebuah kata jadi daftar path yang offset-nya sudah dipanggang.
 * Huruf "t" menyumbang dua path: hurufnya sendiri, lalu palang panjangnya.
 */
function layout(word, startX) {
  let x = startX;
  const ds = [];
  for (const ch of word) {
    const glyph = GLYPHS[ch];
    ds.push(translatePath(glyph.d, x));
    if (ch === "t") ds.push(translatePath(tBar(), x));
    // Palang "t" menonjol 60 unit melewati sisi kanannya, jadi advance aslinya
    // menyisakan jarak terlalu rapat ke "a". Ruangnya dikembalikan di sini,
    // bukan dengan memendekkan palangnya, karena tonjolan itu justru detailnya.
    x += glyph.adv + (ch === "t" ? T_BAR_OVERHANG : 0) + TRACKING;
  }
  return { ds, start: startX, end: x - TRACKING };
}

function buildWordmark() {
  const haluan = layout("haluan", 0);
  // Jeda antarkata lebih lebar dari spasi biasa: dua warna yang berdampingan
  // butuh ruang bernapas supaya tidak terbaca sebagai satu kata.
  const tap = layout("tap", haluan.end + 300);

  return {
    ink: haluan.ds,
    hot: tap.ds,
    // Kotak kata "tap": bidang bergradasi digambar di sini, lalu dipotong
    // mengikuti bentuk hurufnya.
    hotFrom: Math.round(tap.start),
    hotTo: Math.round(tap.end),
    width: Math.round(tap.end),
    // Huruf kecil memakai kotak yang jauh lebih tinggi daripada kapital:
    // ascender "h" dan "l" naik sampai -740, dan ekor "p" turun sampai +266.
    top: -740,
    bottom: 266,
  };
}

/* ── Marka aplikasi ──────────────────────────────────────────────────── */

/**
 * Marka aplikasi: kata "TAP" kapital, satu baris.
 *
 * Kapital, bukan huruf kecil seperti wordmark-nya, dan itu keputusan teknis.
 * Kapital tidak punya ascender maupun descender, jadi pada kanvas persegi
 * hurufnya bisa jauh lebih besar — dan ruang itulah yang menentukan apakah tiga
 * huruf masih terbaca di 16px.
 *
 * Hurufnya juga ditebalkan lewat stroke yang mengikuti fill-nya sendiri.
 * Poppins Bold adalah bobot terberat yang ada di repo ini, dan pada 16px ia
 * masih terlalu ramping. Stroke yang sama sekaligus membulatkan sudutnya, yang
 * memang arah yang diminta.
 */
/**
 * Tracking dan ketebalan keduanya didorong sejauh mungkin, dan angkanya berasal
 * dari melihat hasilnya di ukuran render sebenarnya.
 *
 * Diukur pada kanvas 512 yang diperkecil: dengan weight 44 dan tracking -30,
 * "TAP" baru terbaca mulai 32px. Dengan weight 82 dan tracking -55 ia terbaca
 * mulai 20px. Di 16px keduanya sama-sama TIDAK terbaca sebagai tiga huruf —
 * tinggi kapitalnya di sana hanya sekitar 5px. Itu batas nyata dari tiga huruf
 * pada kanvas 16px, bukan sesuatu yang bisa disetel habis.
 */
const MARK_TRACKING = -0.055 * UPEM;
const MARK_WEIGHT = 82;

function markLetters() {
  let x = 0;
  const ds = [];
  for (const ch of "TAP") {
    ds.push(translatePath(GLYPHS[ch].d, x));
    x += GLYPHS[ch].adv + MARK_TRACKING;
  }
  return { ds, width: x - MARK_TRACKING };
}

/**
 * Padding bawaan sengaja rapat: kata "TAP" melebar, jadi lebarnya yang jadi
 * batas, dan setiap piksel padding langsung memotong tinggi hurufnya di 16px.
 *
 * Ikon maskable TIDAK boleh memakai nilai ini. Android memotong maskable ke
 * bentuk sistem, dan zona amannya adalah lingkaran berdiameter 80% kanvas.
 * Untuk kata selebar ini, persegi panjang terlebar yang muat di lingkaran itu
 * hanya sekitar 382px pada kanvas 512 — jadi paddingnya harus sekitar 65,
 * bukan 12. Tanpa itu, huruf T dan P terpotong di sudut.
 */
function buildMark({ background = null, mono = null, pad = 12 } = {}) {
  const S = 512;
  const box = S - pad * 2;

  const letters = markLetters();
  // Stroke menambah lebar di kedua sisi, jadi kotak yang harus muat adalah
  // huruf plus setengah stroke di kiri dan kanan.
  const artW = letters.width + MARK_WEIGHT;
  const artH = CAP + MARK_WEIGHT;
  const scale = Math.min(box / artW, box / artH);
  const tx = pad + (box - artW * scale) / 2 + (MARK_WEIGHT / 2) * scale;
  const ty = pad + (box + artH * scale) / 2 - (MARK_WEIGHT / 2) * scale;
  const place = `transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})"`;
  const shape = `stroke-width="${MARK_WEIGHT}" stroke-linejoin="round"`;

  const paths = (fill) =>
    letters.ds.map((d) => `<path d="${d}" fill="${fill}" stroke="${fill}" ${shape}/>`).join("");

  if (mono) {
    // Android meratakan badge notifikasi jadi siluet, jadi tidak ada gradasi
    // dan tidak ada transparansi parsial yang bisa bertahan di sana.
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
      `<g ${place}>${paths(mono)}</g>`,
      `</svg>`,
    ].join("");
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
    `<defs>`,
    // userSpaceOnUse dalam ruang huruf: offset tiap huruf sudah dipanggang ke
    // path-nya, jadi ketiganya berbagi satu ruang dan sapuannya melintasi kata,
    // bukan mengulang di tiap huruf.
    `<linearGradient id="hot" gradientUnits="userSpaceOnUse" x1="0" y1="-${CAP}" x2="${letters.width.toFixed(0)}" y2="0">`,
    // Kedua ujung --gradient-hot (BRAND-SYSTEM.md §3.1).
    `<stop offset="0" stop-color="#fb007f"/><stop offset="1" stop-color="#d226c7"/>`,
    `</linearGradient></defs>`,
    background ? `<rect width="${S}" height="${S}" fill="${background}"/>` : "",
    `<g ${place}>${paths("url(#hot)")}</g>`,
    `</svg>`,
  ].join("");
}

/* ── Keluaran ────────────────────────────────────────────────────────── */

const wordmark = buildWordmark();

const OUTPUTS = [
  { file: "favicon.svg", svg: buildMark() },
  { file: "icon-192.png", svg: buildMark(), size: 192 },
  { file: "icon-512.png", svg: buildMark(), size: 512 },
  // pad 66: zona aman maskable. pad 46: iOS memakai topeng sudut membulat
  // sendiri, lebih longgar daripada lingkaran Android tapi tetap memotong sudut.
  { file: "icon-maskable-512.png", svg: buildMark({ background: "#fcfcfc", pad: 66 }), size: 512, flatten: true },
  { file: "apple-icon.png", svg: buildMark({ background: "#fcfcfc", pad: 46 }), size: 180, flatten: true },
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
  // Daftar path polos: offset tiap huruf sudah dipanggang ke dalam datanya,
  // jadi tidak ada lagi koordinat terpisah yang harus dibawa komponennya.
  const glyphs = (list) =>
    `[\n${list.map((d) => `  ${JSON.stringify(d)},`).join("\n")}\n]`;

  writeFileSync(
    resolve(ROOT, "app/components/brand-logo-paths.ts"),
    [
      "// DIHASILKAN scripts/build-brand.mjs. Jangan disunting tangan.",
      "// Outline Poppins Bold (SIL OFL 1.1) plus palang huruf t yang digambar ulang.",
      "// Lihat BRAND-LOGO-SOURCES.md untuk sumber dan lisensinya.",
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
      `export const WORDMARK_INK: readonly string[] = ${glyphs(wordmark.ink)};`,
      "",
      "/** Kata \"TAP\": dipotong dari bidang bergradasi, lihat --wordmark-from/to. */",
      `export const WORDMARK_HOT: readonly string[] = ${glyphs(wordmark.hot)};`,
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
