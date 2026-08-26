import assert from "node:assert/strict";
import test from "node:test";
import { formatCommission, minCommission, parseCommissionCell } from "../lib/commission.ts";

const value = (input) => parseCommissionCell(input);
const ok = (input) => {
  const parsed = value(input);
  assert.equal(parsed.ok, true, `expected ${JSON.stringify(input)} to parse, got ${JSON.stringify(parsed)}`);
  return parsed.value;
};
const rejected = (input, reason) => {
  const parsed = value(input);
  assert.equal(parsed.ok, false, `expected ${JSON.stringify(input)} to be rejected, got ${JSON.stringify(parsed)}`);
  if (reason) assert.equal(parsed.reason, reason);
};

test("angka desimal telanjang dibaca sebagai fraksi, bukan persen", () => {
  // Sheet menyimpan 0.09 untuk 9%. Salah baca di sini membuat seluruh katalog salah.
  assert.equal(ok("0.09"), 9);
  assert.equal(ok("0.1"), 10);
  assert.equal(ok("0.115"), 11.5);
  assert.equal(ok("0,09"), 9);
  assert.equal(ok("0,1"), 10);
});

test("angka bulat telanjang sudah dalam satuan persen", () => {
  assert.equal(ok("12"), 12);
  assert.equal(ok("9"), 9);
});

test("nilai dengan simbol persen dibaca apa adanya", () => {
  assert.equal(ok("13%"), 13);
  assert.equal(ok("7,5%"), 7.5);
  assert.equal(ok("7.5%"), 7.5);
  assert.equal(ok("10 %"), 10);
});

test("rentang memakai batas terendah", () => {
  assert.equal(ok("9-10%"), 9);
  assert.equal(ok("10%-11%"), 10);
  assert.equal(ok("10 - 13%"), 10);
  assert.equal(ok("1-5%"), 1);
  assert.equal(ok("10–17%"), 10);
});

test("daftar tier memakai nilai terkecil", () => {
  assert.equal(ok("10,11,12%"), 10);
  assert.equal(ok("9,10,11,12%"), 9);
  assert.equal(ok("8,10,11%"), 8);
  assert.equal(ok("11/12%"), 11);
  assert.equal(ok("10&15%"), 10);
});

test("penanda versi dan kualifikasi dibuang sebelum parsing", () => {
  assert.equal(ok("11% 2.0"), 11);
  assert.equal(ok("12% 2.0 "), 12);
  assert.equal(ok("10% (2.0)"), 10);
  assert.equal(ok("10%(2.0)"), 10);
  assert.equal(ok("8% (3.0)"), 8);
  assert.equal(ok("10% (khusus top)"), 10);
  assert.equal(ok("SKU KHUSUS HDA (10%)"), 10);
  assert.equal(ok("SKU KHUSUS HDA (11%)"), 11);
});

test("nilai kosong dan placeholder ditolak", () => {
  rejected("", "empty");
  rejected("   ", "empty");
  rejected("-", "empty");
  rejected("N/A", "unrecognized");
});

test("teks yang bukan angka ditolak, tidak ditebak", () => {
  // Kolom bergeser pernah menaruh nama kategori dan nama brand di kolom komisi.
  rejected("Beauty", "unrecognized");
  rejected("raecca", "unrecognized");
  rejected("skincare", "unrecognized");
});

test("koma tunggal dengan dua digit tetap ambigu dan ditolak", () => {
  // "8,10" bisa berarti 8.10 atau tier 8 dan 10. Menebak di sini mengubah angka publik.
  rejected("8,10", "ambiguous_separator");
  rejected("11,12", "ambiguous_separator");
});

test("rentang terbalik dianggap salah ketik dan ditolak", () => {
  // "10-1%" hampir pasti salah ketik "10-11%". Batas terendah 1% akan menyesatkan.
  rejected("10-1%", "descending_range");
});

test("nilai di luar rentang wajar ditolak", () => {
  rejected("101%", "out_of_range");
  rejected("0%", "out_of_range");
  rejected("0", "out_of_range");
});

test("minCommission mengambil nilai terkecil yang valid", () => {
  assert.equal(minCommission(["0.11", "11% 2.0", "0.12", "12% 2.0 "]), 11);
  assert.equal(minCommission(["9-10%", "0.1"]), 9);
  assert.equal(minCommission(["0.09", "0.1"]), 9);
  assert.equal(minCommission(["Beauty", "0.08"]), 8);
});

test("minCommission mengembalikan null bila tidak ada nilai valid", () => {
  assert.equal(minCommission([]), null);
  assert.equal(minCommission(["Beauty", "-", ""]), null);
});

test("format komisi memakai desimal koma dan tanpa nol berlebih", () => {
  assert.equal(formatCommission(9), "9%");
  assert.equal(formatCommission(7.5), "7,5%");
  assert.equal(formatCommission(11), "11%");
  assert.equal(formatCommission(null), "—");
});
