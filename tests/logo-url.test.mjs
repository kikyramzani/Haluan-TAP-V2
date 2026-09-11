import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLogoUrl, validateLogoUrl } from "../lib/logo-url.ts";

/**
 * Penjaga untuk kolom Brand.logoUrl, yang sejak katalog membacanya
 * (lib/catalog-db.ts) menjadi sumber `src` next/image di SETIAP kartu brand.
 *
 * Taruhannya bukan satu kartu jelek: next/image MELEMPAR untuk sumber yang
 * tidak dikenalinya, dan itu terjadi di dalam Server Component, jadi satu baris
 * basis data yang rusak menjatuhkan seluruh /deals. Kolomnya sendiri adalah
 * input teks bebas di /admin/brand — jadi nilai aneh di sana bukan hipotesis.
 */

test("path statis hasil migrasi diteruskan apa adanya", () => {
  assert.equal(normalizeLogoUrl("/brand-logos/wardah.webp"), "/brand-logos/wardah.webp");
});

test("URL https Vercel Blob diteruskan apa adanya", () => {
  const url = "https://abc123.public.blob.vercel-storage.com/brand-logos/anua-1757000000000.webp";
  assert.equal(normalizeLogoUrl(url), url);
});

test("data URL peninggalan CMS lama tetap didukung", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(normalizeLogoUrl(dataUrl), dataUrl);
});

test("path tanpa garis miring depan ditolak, bukan diteruskan", () => {
  // next/image memperlakukannya sebagai sumber jauh tanpa host dan melempar.
  assert.equal(normalizeLogoUrl("brand-logos/wardah.webp"), null);
});

test("URL protocol-relative ditolak walau diawali garis miring", () => {
  // "//host/x.png" bukan path lokal; ia mengambil gambar dari host lain.
  assert.equal(normalizeLogoUrl("//evil.example/logo.png"), null);
});

test("host https di luar Vercel Blob ditolak", () => {
  assert.equal(normalizeLogoUrl("https://evil.example/logo.png"), null);
});

test("host yang hanya menyerupai domain Blob ditolak", () => {
  // Pencocokannya harus akhiran ".public.blob.vercel-storage.com", bukan
  // sekadar mengandung namanya di tempat lain.
  assert.equal(normalizeLogoUrl("https://public.blob.vercel-storage.com.evil.example/x.webp"), null);
});

test("skema berbahaya ditolak", () => {
  assert.equal(normalizeLogoUrl("javascript:alert(1)"), null);
});

test("kosong, spasi, dan null jadi null", () => {
  assert.equal(normalizeLogoUrl(""), null);
  assert.equal(normalizeLogoUrl("   "), null);
  assert.equal(normalizeLogoUrl(null), null);
  assert.equal(normalizeLogoUrl(undefined), null);
});

test("validateLogoUrl menerima kosong sebagai 'tidak ada logo', bukan galat", () => {
  assert.deepEqual(validateLogoUrl(""), { ok: true, value: null });
});

test("validateLogoUrl MENOLAK nilai rusak alih-alih membuangnya diam-diam", () => {
  // Bedanya dengan normalizeLogoUrl: yang ini dipakai form admin, dan orang
  // yang baru saja mengetik nilainya berhak diberi tahu.
  const result = validateLogoUrl("brand-logos/wardah.webp");
  assert.equal(result.ok, false);
  assert.match(result.message, /garis miring/);
});
