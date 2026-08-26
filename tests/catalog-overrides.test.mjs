import assert from "node:assert/strict";
import test from "node:test";
import { applyOverride, manualCampaign, mergeCatalog, overrideId, overridePlatform } from "../lib/catalog-overrides.ts";

const base = {
  id: "skintific",
  brand: "Skintific",
  category: "Beauty & Health",
  platform: "TikTok Shop",
  commission: 8,
  tierCommissions: [8, 9, 10],
  campaignCount: 3,
  hasSample: true,
  gmvRank: 4,
  updated: "",
  campaign: "Skintific TAP",
  image: null,
  specialLivePrice: false,
  expiresAt: null,
  newSku: false,
};

const stamp = { updatedAt: "2026-08-25T00:00:00.000Z", updatedBy: "admin-1" };

test("tanpa override, campaign lewat apa adanya", () => {
  assert.deepEqual(applyOverride(base, undefined), base);
});

test("override menimpa nama tampil, kategori, logo, dan status sample", () => {
  const result = applyOverride(base, {
    brandKey: "skintific",
    displayName: "SKINTIFIC",
    category: "Beauty",
    logo: "data:image/png;base64,AAA",
    hasSample: false,
    ...stamp,
  });
  assert.equal(result.brand, "SKINTIFIC");
  assert.equal(result.id, "skintific");
  assert.equal(result.category, "Beauty");
  assert.equal(result.image, "data:image/png;base64,AAA");
  assert.equal(result.hasSample, false);
});

test("aturan komisi terkecil tetap berlaku setelah admin menyunting satu tier", () => {
  // Tier termurah dinaikkan; yang tampil harus jadi tier termurah berikutnya.
  const raised = applyOverride(base, { brandKey: "skintific", tiers: [{ index: 0, commission: 12 }], ...stamp });
  assert.deepEqual(raised.tierCommissions, [12, 9, 10]);
  assert.equal(raised.commission, 9);

  // Tier mana pun diturunkan, dialah yang tampil.
  const lowered = applyOverride(base, { brandKey: "skintific", tiers: [{ index: 2, commission: 3 }], ...stamp });
  assert.equal(lowered.commission, 3);
});

test("komisi tier bisa dikosongkan tanpa menghapus campaign-nya", () => {
  const result = applyOverride(base, { brandKey: "skintific", tiers: [{ index: 0, commission: null }], ...stamp });
  assert.deepEqual(result.tierCommissions, [null, 9, 10]);
  assert.equal(result.commission, 9);
  assert.equal(result.campaignCount, 3, "campaign tetap ada walau komisinya dikosongkan");
});

test("indeks tier di luar jangkauan diabaikan, tidak membuat tier hantu", () => {
  const result = applyOverride(base, { brandKey: "skintific", tiers: [{ index: 9, commission: 1 }], ...stamp });
  assert.equal(result.campaignCount, 3);
  assert.equal(result.commission, 8, "suntingan yang tidak menunjuk baris mana pun tidak mengubah angka publik");
});

test("campaign tambahan dari admin ikut dihitung dalam komisi terkecil", () => {
  const result = applyOverride(base, {
    brandKey: "skintific",
    manualTiers: [{ label: "Campaign dadakan", commission: 5, tapLink: "https://example.com/x", hasSample: false }],
    ...stamp,
  });
  assert.equal(result.campaignCount, 4);
  assert.equal(result.commission, 5);
});

test("brand yang disembunyikan atau digabung tidak muncul sebagai kartu", () => {
  assert.equal(applyOverride(base, { brandKey: "skintific", hidden: true, ...stamp }), null);
  assert.equal(applyOverride(base, { brandKey: "skintific", mergedInto: "skintificofficial", ...stamp }), null);
});

test("menandai campaign selesai memakai jalur kedaluwarsa yang sudah ada", () => {
  const result = applyOverride(base, { brandKey: "skintific", ended: true, ...stamp });
  assert.equal(result.expiresAt, "01/01/2000");
});

test("mergeCatalog menerapkan override dan menambahkan campaign buatan admin", () => {
  const overrides = new Map([
    ["skintific", { brandKey: "skintific", displayName: "SKINTIFIC", ...stamp }],
    ["brandbaru", {
      brandKey: "brandbaru",
      displayName: "Brand Baru",
      category: "Fashion",
      manualTiers: [{ label: "Campaign 1", commission: 14, tapLink: "https://example.com/a", hasSample: true }],
      ...stamp,
    }],
    // Override tanpa campaign manual dan tanpa padanan di sheet tidak boleh
    // memunculkan kartu kosong.
    ["hantu", { brandKey: "hantu", displayName: "Hantu", ...stamp }],
  ]);

  const merged = mergeCatalog([base], overrides);
  assert.deepEqual(merged.map((item) => item.brand).sort(), ["Brand Baru", "SKINTIFIC"]);
  assert.equal(merged.find((item) => item.brand === "Brand Baru")?.commission, 14);
});

test("sinkron ulang sheet tidak menghapus suntingan admin", () => {
  // Katalog baru hasil sinkron: angka sheet berubah, override tetap sama.
  const overrides = new Map([["skintific", { brandKey: "skintific", tiers: [{ index: 0, commission: 2 }], ...stamp }]]);
  const resynced = { ...base, commission: 11, tierCommissions: [11, 12, 13] };
  const merged = mergeCatalog([resynced], overrides);
  assert.equal(merged[0].commission, 2, "override bertahan melewati sinkronisasi");
  assert.deepEqual(merged[0].tierCommissions, [2, 12, 13], "tier yang tidak disunting mengikuti sheet terbaru");
});

test("campaign buatan admin punya bentuk yang sama dengan campaign sheet", () => {
  const created = manualCampaign({
    brandKey: "brandbaru",
    displayName: "Brand Baru",
    manualTiers: [
      { label: "Campaign 1", commission: 9, tapLink: "https://example.com/a", hasSample: false },
      { label: "Campaign 2", commission: 7, tapLink: "https://example.com/b", hasSample: false },
    ],
    ...stamp,
  });
  assert.equal(created.id, "brand-baru");
  assert.equal(created.commission, 7, "komisi terkecil, sama seperti brand dari sheet");
  assert.equal(created.campaignCount, 2);
  assert.equal(created.gmvRank, null);
});

test("penanda SKU baru hanya datang dari override, tidak pernah dari sheet", () => {
  // Tidak ada satu pun kolom "New SKU" di workbook, jadi parser selalu false
  // dan satu-satunya yang boleh menaikkannya adalah admin.
  assert.equal(base.newSku, false);
  assert.equal(applyOverride(base, { brandKey: "skintific", newSku: true, ...stamp }).newSku, true);
  assert.equal(applyOverride(base, { brandKey: "skintific", newSku: false, ...stamp }).newSku, false);
  // Override yang tidak menyebut newSku sama sekali tidak mengubah nilainya.
  assert.equal(applyOverride(base, { brandKey: "skintific", category: "Tech", ...stamp }).newSku, false);
});

test("override tanpa platform tetap dibaca sebagai TikTok", () => {
  // Seluruh record yang tersimpan sebelum kolom platform ada berbentuk begini.
  assert.equal(overridePlatform({ brandKey: "anua", ...stamp }), "tiktok");
  assert.equal(overridePlatform({ brandKey: "anua", platform: "tiktok", ...stamp }), "tiktok");
  assert.equal(overridePlatform({ brandKey: "anua", platform: "shopee", ...stamp }), "shopee");
});

test("kunci TikTok tidak berubah bentuk, kunci Shopee diberi awalan", () => {
  // Kunci TikTok harus tetap polos supaya record lama di Redis tidak perlu
  // dimigrasi sama sekali.
  assert.equal(overrideId("tiktok", "anua"), "anua");
  assert.equal(overrideId("shopee", "anua"), "shopee:anua");
  assert.notEqual(overrideId("shopee", "anua"), overrideId("tiktok", "anua"));
});

test("brand bernama sama di dua platform tidak saling menimpa", () => {
  // 94 dari 383 brand Shopee memakai nama yang juga ada di TikTok. Menandai
  // yang satu tidak boleh ikut menandai yang lain.
  const shopeeCard = { ...base, id: "shopee-anua", brand: "Anua", platform: "Shopee Affiliate", commission: null, tierCommissions: [], campaignCount: 1 };
  const tiktokCard = { ...base, id: "anua", brand: "Anua" };
  const overrides = new Map([
    [overrideId("tiktok", "anua"), { brandKey: "anua", platform: "tiktok", newSku: true, ...stamp }],
  ]);

  const [tiktokMerged] = mergeCatalog([tiktokCard], overrides, { platform: "tiktok" });
  const [shopeeMerged] = mergeCatalog([shopeeCard], overrides, { platform: "shopee", allowManual: false });
  assert.equal(tiktokMerged.newSku, true);
  assert.equal(shopeeMerged.newSku, false, "penanda TikTok tidak boleh bocor ke Shopee");
});

test("katalog Shopee tidak pernah kemasukan campaign buatan admin", () => {
  // Campaign manual selalu berbentuk TikTok — punya tier dan komisi — jadi
  // menambahkannya ke Shopee berarti menampilkan angka yang sheet-nya tidak punya.
  const overrides = new Map([
    ["dibuat-admin", {
      brandKey: "dibuat-admin",
      manualTiers: [{ label: "Manual", commission: 10, tapLink: "https://example.com/a", hasSample: false }],
      ...stamp,
    }],
  ]);
  const shopeeCard = { ...base, id: "shopee-anua", brand: "Anua", platform: "Shopee Affiliate" };

  const shopee = mergeCatalog([shopeeCard], overrides, { platform: "shopee", allowManual: false });
  assert.equal(shopee.length, 1);
  assert.equal(shopee.every((item) => item.platform === "Shopee Affiliate"), true);

  // Di TikTok campaign manual itu memang harus muncul.
  const tiktok = mergeCatalog([base], overrides, { platform: "tiktok" });
  assert.equal(tiktok.length, 2);
});

test("manualCampaign ikut membawa penanda SKU baru", () => {
  const card = manualCampaign({
    brandKey: "brand-baru",
    displayName: "Brand Baru",
    newSku: true,
    manualTiers: [{ label: "Campaign 1", commission: 12, tapLink: "https://example.com/a", hasSample: false }],
    ...stamp,
  });
  assert.equal(card.newSku, true);
});

