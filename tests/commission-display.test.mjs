import assert from "node:assert/strict";
import test from "node:test";
import { campaignCommissionLabel, commissionRangeLabel, commissionValues, minMaxCommission } from "../lib/commission-display.ts";

test("commissionValues membuang tier dengan komisi null", () => {
  assert.deepEqual(commissionValues([{ commission: 9 }, { commission: null }, { commission: 12 }]), [9, 12]);
});

test("commissionValues menerima Decimal-like (punya toString)", () => {
  const decimalLike = { toString: () => "7.5" };
  assert.deepEqual(commissionValues([{ commission: decimalLike }]), [7.5]);
});

test("minMaxCommission mengembalikan null/null saat semua tier tanpa komisi", () => {
  assert.deepEqual(minMaxCommission([{ commission: null }, { commission: null }]), { min: null, max: null });
});

test("minMaxCommission mengambil batas terendah dan tertinggi dari tier bernomor", () => {
  assert.deepEqual(minMaxCommission([{ commission: 9 }, { commission: 15 }, { commission: 12 }]), { min: 9, max: 15 });
});

test("commissionRangeLabel selalu 'Ketentuan platform' untuk KETENTUAN_PLATFORM, walau ada angka nyasar", () => {
  assert.equal(commissionRangeLabel({ commissionType: "KETENTUAN_PLATFORM", min: 9, max: 15 }), "Ketentuan platform");
});

test("commissionRangeLabel menampilkan satu nilai ketika belum ada rentang", () => {
  assert.equal(commissionRangeLabel({ commissionType: "PERSENTASE", min: null, max: null }), "—");
  assert.equal(commissionRangeLabel({ commissionType: "PERSENTASE", min: 9, max: 9 }), "9%");
  assert.equal(commissionRangeLabel({ commissionType: "PERSENTASE", min: 9, max: null }), "9%");
});

test("commissionRangeLabel menampilkan rentang ketika min dan max berbeda", () => {
  assert.equal(commissionRangeLabel({ commissionType: "PERSENTASE", min: 9, max: 15 }), "9% – 15%");
});

test("campaignCommissionLabel: Ketentuan platform mengabaikan nilai komisi", () => {
  assert.equal(campaignCommissionLabel({ commissionType: "KETENTUAN_PLATFORM", commission: 9 }), "Ketentuan platform");
  assert.equal(campaignCommissionLabel({ commissionType: "KETENTUAN_PLATFORM", commission: null }), "Ketentuan platform");
});

test("campaignCommissionLabel: Persentase memformat angka atau '—' saat null", () => {
  assert.equal(campaignCommissionLabel({ commissionType: "PERSENTASE", commission: 9 }), "9%");
  assert.equal(campaignCommissionLabel({ commissionType: "PERSENTASE", commission: null }), "—");
});
