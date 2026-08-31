import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHotBadge,
  TRENDING_MIN_CLICKS_7D,
  CONVERSION_MIN_CLICKS_30D,
  DEMAND_MIN_SCORE,
} from "../lib/hot-deals-config.ts";

/** Every field at a value that earns nothing, so each test only varies what it's about. */
function inert(overrides = {}) {
  return {
    featured: false,
    clicks7d: 0,
    clicks30d: 0,
    sampleRequests30d: 0,
    savedCount: 0,
    trendingRankCutoff: Infinity,
    conversionBar: 5,
    ...overrides,
  };
}

test("tanpa sinyal apa pun tidak dapat badge — bukan diisi placeholder", () => {
  assert.equal(resolveHotBadge(inert()), null);
});

test("brand featured selalu menang, bahkan dengan nol trafik", () => {
  assert.equal(resolveHotBadge(inert({ featured: true })), "TOP_BRAND");
});

test("featured mengalahkan sinyal lain yang juga memenuhi syarat", () => {
  const badge = resolveHotBadge(
    inert({ featured: true, clicks7d: 999, trendingRankCutoff: 10, clicks30d: 100, sampleRequests30d: 90, savedCount: 50 }),
  );
  assert.equal(badge, "TOP_BRAND");
});

test("trending butuh lantai klik DAN peringkat desil teratas", () => {
  // Cukup peringkat, tapi di bawah lantai.
  assert.equal(resolveHotBadge(inert({ clicks7d: TRENDING_MIN_CLICKS_7D - 1, trendingRankCutoff: 1 })), null);
  // Cukup lantai, tapi belum masuk desil teratas.
  assert.equal(
    resolveHotBadge(inert({ clicks7d: TRENDING_MIN_CLICKS_7D, trendingRankCutoff: TRENDING_MIN_CLICKS_7D + 50 })),
    null,
  );
  // Keduanya terpenuhi.
  assert.equal(
    resolveHotBadge(inert({ clicks7d: TRENDING_MIN_CLICKS_7D, trendingRankCutoff: TRENDING_MIN_CLICKS_7D })),
    "TRENDING",
  );
});

test("konversi tinggi butuh volume klik minimum — 1 sample dari 1 klik bukan '100%'", () => {
  assert.equal(resolveHotBadge(inert({ clicks30d: 1, sampleRequests30d: 1, conversionBar: 5 })), null);
});

test("konversi tinggi lolos hanya bila melewati ambang nyata dari data situs", () => {
  const clicks30d = CONVERSION_MIN_CLICKS_30D;
  // 10% konversi, ambang 5 → lolos.
  assert.equal(
    resolveHotBadge(inert({ clicks30d, sampleRequests30d: Math.ceil(clicks30d * 0.1), conversionBar: 5 })),
    "HIGH_CONVERSION",
  );
  // Konversi sama, tapi ambangnya lebih tinggi → tidak lolos.
  assert.equal(resolveHotBadge(inert({ clicks30d, sampleRequests30d: Math.ceil(clicks30d * 0.1), conversionBar: 40 })), null);
});

test("banyak peminat menjumlahkan simpanan dan request sample", () => {
  assert.equal(resolveHotBadge(inert({ savedCount: DEMAND_MIN_SCORE - 1 })), null);
  assert.equal(resolveHotBadge(inert({ savedCount: DEMAND_MIN_SCORE })), "HIGH_DEMAND");
  assert.equal(
    resolveHotBadge(inert({ savedCount: DEMAND_MIN_SCORE - 1, sampleRequests30d: 1 })),
    "HIGH_DEMAND",
  );
});

test("urutan prioritas: trending di atas konversi, konversi di atas peminat", () => {
  const bothTrendingAndConversion = inert({
    clicks7d: TRENDING_MIN_CLICKS_7D,
    trendingRankCutoff: TRENDING_MIN_CLICKS_7D,
    clicks30d: CONVERSION_MIN_CLICKS_30D,
    sampleRequests30d: CONVERSION_MIN_CLICKS_30D,
    conversionBar: 5,
  });
  assert.equal(resolveHotBadge(bothTrendingAndConversion), "TRENDING");

  const bothConversionAndDemand = inert({
    clicks30d: CONVERSION_MIN_CLICKS_30D,
    sampleRequests30d: CONVERSION_MIN_CLICKS_30D,
    savedCount: DEMAND_MIN_SCORE,
    conversionBar: 5,
  });
  assert.equal(resolveHotBadge(bothConversionAndDemand), "HIGH_CONVERSION");
});
