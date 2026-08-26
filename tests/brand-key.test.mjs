import assert from "node:assert/strict";
import test from "node:test";
import { brandKey, brandMetricsKey, brandSlug, normalizeBrandName, preferredBrandName } from "../lib/brand-key.ts";

test("varian penulisan brand yang sama menghasilkan kunci identik", () => {
  // Semua pasangan ini benar-benar ada di worksheet List Campaign (All TAP).
  const same = [
    ["MS Glow", "MS Glow "],
    ["MLT", "MLT "],
    ["AOYAMA", "Aoyama"],
    ["POSE", "Pose"],
    ["Blackmores", "Blackmores "],
    ["Jim's Honey Indonesia", "Jims.Honey (INDONESIA)"],
    ["Glow FX", "Glow FX "],
    [" sunsilk", "Sunsilk"],
  ];
  for (const [a, b] of same) {
    assert.equal(brandKey(a), brandKey(b), `${a} dan ${b} seharusnya satu brand`);
  }
});

test("brand yang berbeda tidak digabung", () => {
  assert.notEqual(brandKey("Skintific"), brandKey("Skinproof"));
  assert.notEqual(brandKey("Glow FX"), brandKey("Glow Better"));
  assert.notEqual(brandKey("MS Glow"), brandKey("MSGlow Men"));
});

test("kunci metrik menjembatani ejaan sheet GMV", () => {
  // Sheet GMV Campaign Brand menulis "Skintificid" untuk brand "Skintific".
  assert.equal(brandMetricsKey("Skintificid"), brandMetricsKey("Skintific"));
  assert.equal(brandMetricsKey("Hanasui Indonesia"), brandMetricsKey("Hanasui"));
  assert.equal(brandMetricsKey("Wardah Official"), brandMetricsKey("Wardah"));
});

test("sufiks tidak dibuang bila batang brand jadi terlalu pendek", () => {
  // "Ovid" tidak boleh menyusut jadi "ov".
  assert.equal(brandMetricsKey("Ovid"), "ovid");
  assert.equal(brandMetricsKey("Rid"), "rid");
});

test("slug stabil terhadap spasi menggantung dan kapitalisasi", () => {
  assert.equal(brandSlug("MS Glow "), "ms-glow");
  assert.equal(brandSlug("AOYAMA"), "aoyama");
  assert.equal(brandSlug("Jim's Honey Indonesia"), "jim-s-honey-indonesia");
  assert.equal(brandSlug("  Glad2Glow  "), "glad2glow");
});

test("nama tampil memilih kapitalisasi campuran lalu yang paling sering", () => {
  assert.equal(preferredBrandName(["AOYAMA", "Aoyama"]), "Aoyama");
  assert.equal(preferredBrandName(["POSE", "Pose", "POSE"]), "Pose");
  assert.equal(preferredBrandName(["MS Glow ", "MS Glow"]), "MS Glow");
  assert.equal(preferredBrandName(["SKIN1004", "SKIN1004"]), "SKIN1004");
  assert.equal(preferredBrandName([]), "");
});

test("normalisasi nama merapikan spasi tanpa mengubah ejaan", () => {
  assert.equal(normalizeBrandName("  Glow   FX "), "Glow FX");
  assert.equal(normalizeBrandName("L'Oréal"), "L'Oréal");
});
