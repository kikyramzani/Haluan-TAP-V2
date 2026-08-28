import assert from "node:assert/strict";
import test from "node:test";
import { scoreCampaignForCreator, topQuartileThreshold } from "../lib/recommendation.ts";

const base = {
  categoryMatches: false,
  brandPreviouslyClicked: false,
  hasSample: false,
  isTopQuartileCommission: false,
  daysUntilEnd: null,
};

test("tidak ada faktor cocok -> skor 0", () => {
  assert.equal(scoreCampaignForCreator(base), 0);
});

test("kategori cocok memberi +3", () => {
  assert.equal(scoreCampaignForCreator({ ...base, categoryMatches: true }), 3);
});

test("brand pernah diklik memberi +2", () => {
  assert.equal(scoreCampaignForCreator({ ...base, brandPreviouslyClicked: true }), 2);
});

test("sample tersedia memberi +1", () => {
  assert.equal(scoreCampaignForCreator({ ...base, hasSample: true }), 1);
});

test("komisi kuartil teratas memberi +1", () => {
  assert.equal(scoreCampaignForCreator({ ...base, isTopQuartileCommission: true }), 1);
});

test("berakhir dalam 7 hari memberi -2", () => {
  assert.equal(scoreCampaignForCreator({ ...base, daysUntilEnd: 3 }), -2);
  assert.equal(scoreCampaignForCreator({ ...base, daysUntilEnd: 7 }), -2);
});

test("berakhir lebih dari 7 hari lagi tidak kena penalti", () => {
  assert.equal(scoreCampaignForCreator({ ...base, daysUntilEnd: 8 }), 0);
});

test("campaign yang sudah lewat (daysUntilEnd negatif) tidak kena penalti -2 ini (dianggap sudah difilter di tempat lain)", () => {
  assert.equal(scoreCampaignForCreator({ ...base, daysUntilEnd: -1 }), 0);
});

test("semua faktor positif digabung, lalu penalti berakhir mengurangi totalnya", () => {
  const score = scoreCampaignForCreator({ categoryMatches: true, brandPreviouslyClicked: true, hasSample: true, isTopQuartileCommission: true, daysUntilEnd: 2 });
  assert.equal(score, 3 + 2 + 1 + 1 - 2);
});

test("topQuartileThreshold kosong -> null", () => {
  assert.equal(topQuartileThreshold([]), null);
});

test("topQuartileThreshold mengambil persentil ke-75 dari data terurut", () => {
  // 10 nilai 1..10 -> index floor(10*0.75)=7 -> nilai ke-8 (index 7, 0-based) = 8
  assert.equal(topQuartileThreshold([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 8);
});

test("topQuartileThreshold satu nilai -> nilai itu sendiri", () => {
  assert.equal(topQuartileThreshold([5]), 5);
});
