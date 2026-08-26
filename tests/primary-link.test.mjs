import assert from "node:assert/strict";
import test from "node:test";
import { pickPrimaryLink } from "../lib/campaign-links.ts";

const link = (label, commission, url = `https://affiliate-id.tokopedia.com/api/v1/share/${label}`) => ({
  url,
  brand: "Contoh",
  label,
  hasSample: false,
  expiresAt: null,
  commission,
});

test("link yang dipakai adalah tier dengan komisi terkecil", () => {
  // Kartu brand menjanjikan angka terkecil, jadi linknya harus milik tier itu.
  const chosen = pickPrimaryLink([link("a", 12), link("b", 8), link("c", 10)]);
  assert.equal(chosen.label, "b");
  assert.equal(chosen.commission, 8);
});

test("komisi terkecil tetap menang walau bukan baris pertama", () => {
  // MLT, KAHI, dan WOSADO di data asli persis seperti ini.
  assert.equal(pickPrimaryLink([link("a", 12), link("b", 11)]).label, "b");
  assert.equal(pickPrimaryLink([link("a", 15), link("b", 7)]).label, "b");
  assert.equal(pickPrimaryLink([link("a", 7), link("b", 6)]).label, "b");
});

test("seri diputus oleh baris yang lebih dulu muncul di sheet", () => {
  const chosen = pickPrimaryLink([link("pertama", 9), link("kedua", 9)]);
  assert.equal(chosen.label, "pertama");
});

test("tier tanpa komisi tidak pernah menang atas tier yang punya angka", () => {
  // Sel yang tidak terbaca bukan berarti komisinya nol.
  assert.equal(pickPrimaryLink([link("kosong", null), link("terbaca", 11)]).label, "terbaca");
  assert.equal(pickPrimaryLink([link("terbaca", 11), link("kosong", null)]).label, "terbaca");
});

test("bila tidak ada komisi sama sekali, link pertama yang dipakai", () => {
  // Seluruh brand Shopee jatuh ke cabang ini: sheet-nya tidak punya kolom komisi.
  const chosen = pickPrimaryLink([link("shopee-1", null), link("shopee-2", null)]);
  assert.equal(chosen.label, "shopee-1");
});

test("brand dengan satu link mengembalikan link itu", () => {
  assert.equal(pickPrimaryLink([link("tunggal", 9)]).label, "tunggal");
  assert.equal(pickPrimaryLink([link("tunggal", null)]).label, "tunggal");
});

test("brand tanpa link sama sekali mengembalikan null", () => {
  assert.equal(pickPrimaryLink([]), null);
});

test("komisi nol koma sekian tetap dibandingkan sebagai angka", () => {
  // Perbandingan string akan menaruh "10" sebelum "9"; ini menjaga agar tidak.
  assert.equal(pickPrimaryLink([link("a", 10), link("b", 9)]).label, "b");
  assert.equal(pickPrimaryLink([link("a", 7.5), link("b", 7)]).label, "b");
});
