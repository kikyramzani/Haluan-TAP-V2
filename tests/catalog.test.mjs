import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildCampaignCatalog, buildShopeeCampaigns } from "../lib/catalog.ts";
import { buildBrandMetrics, lookupBrandMetric } from "../lib/brand-metrics.ts";
import { cleanShopeeBrand } from "../lib/shopee-catalog.ts";

const HEADERS = "No,Brand,Category,OPEN PLAN,CREATOR COMMISSION,TAP LINK,Status TAP Link,Last Update,Campaign TAP,Form,Note,End Date";
const link = (slug) => `https://affiliate-id.tokopedia.com/api/v1/share/${slug}`;
const row = ({ no = "", brand = "", category = "", open = "", rate = "", url = "", status = "", updated = "", campaign = "", note = "" }) =>
  [no, brand, category, open, rate, url, status, updated, campaign, "", note, ""].join(",");
const csv = (...rows) => [HEADERS, ...rows].join("\n");

test("komisi brand memakai nilai terkecil dari seluruh tier", () => {
  // Baris lanjutan mewakili sel yang di-merge di spreadsheet: brand kosong
  // berarti "masih brand yang sama".
  const source = csv(
    row({ no: "1", brand: "Skin1004", category: "Beauty", rate: "11%", url: link("a") }),
    row({ rate: "12%", url: link("b") }),
    row({ rate: "11% 2.0", url: link("c") }),
  );
  const { campaigns } = buildCampaignCatalog(source);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].brand, "Skin1004");
  assert.equal(campaigns[0].commission, 11, "yang tampil adalah komisi terendah, bukan tertinggi");
  assert.equal(campaigns[0].campaignCount, 3);
});

test("pecahan desimal di sheet dibaca sebagai persen yang benar", () => {
  // 0.09 di sheet berarti 9%, bukan 0,09%.
  const { campaigns } = buildCampaignCatalog(
    csv(row({ no: "1", brand: "Scora", category: "Beauty", rate: "0.09", url: link("a") })),
  );
  assert.equal(campaigns[0].commission, 9);
});

test("varian penulisan brand digabung jadi satu kartu", () => {
  const { campaigns } = buildCampaignCatalog(
    csv(
      row({ no: "1", brand: "MS Glow ", category: "Beauty", rate: "10%", url: link("a") }),
      row({ no: "2", brand: "MS Glow", category: "Beauty", rate: "8%", url: link("b") }),
    ),
  );
  assert.equal(campaigns.length, 1, "spasi menggantung bukan brand baru");
  assert.equal(campaigns[0].commission, 8);
  assert.equal(campaigns[0].campaignCount, 2);
});

test("baris tanpa link dan berstatus Unavailable tidak masuk katalog", () => {
  const { campaigns } = buildCampaignCatalog(
    csv(
      row({ no: "1", brand: "Tanpa Link", category: "Beauty", rate: "10%" }),
      row({ no: "2", brand: "Mati", category: "Beauty", rate: "10%", url: link("b"), status: "Unavailable" }),
      row({ no: "3", brand: "Hidup", category: "Beauty", rate: "10%", url: link("c"), status: "Updated" }),
    ),
  );
  assert.deepEqual(campaigns.map((item) => item.brand), ["Hidup"]);
});

test("brand tetap tampil walau komisinya tidak terbaca, dan alasannya dilaporkan", () => {
  // Menghapus brand karena satu sel kotor menyembunyikan campaign yang sah.
  // Yang benar adalah menampilkan "—" dan melaporkan barisnya ke ops.
  const { campaigns, issues } = buildCampaignCatalog(
    csv(row({ no: "1", brand: "Raecca", category: "Beauty", rate: "raecca", url: link("a") })),
  );
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].commission, null);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "CREATOR COMMISSION");
  assert.equal(issues[0].reason, "unrecognized");
});

test("nilai di kolom brand yang berupa URL diabaikan", () => {
  const { campaigns } = buildCampaignCatalog(
    csv(row({ no: "1", brand: "http://sculpt.id", category: "Beauty", rate: "10%", url: link("a") })),
  );
  assert.equal(campaigns.length, 0, "URL bukan nama brand");
});

test("kolom kategori tanpa judul tetap terbaca dari posisinya", () => {
  // Worksheet terbaru memberi kolom kategori judul berisi tiga spasi.
  const headers = "No,Brand,   ,OPEN PLAN,TOTAL COMMISSION,CREATOR COMMISSION,TAP LINK URL,Status TAP Link";
  const source = [headers, `1,Scora,Beauty,0.04,0.14,0.09,${link("a")},Updated`].join("\n");
  const { campaigns } = buildCampaignCatalog(source);
  assert.equal(campaigns[0].category, "Beauty & Health");
  assert.equal(campaigns[0].commission, 9, "kolom TAP LINK URL dan CREATOR COMMISSION tetap ditemukan");
});

test("status sample diambil dari sheet metrik, bukan ditebak", () => {
  const metricsCsv = [
    "AGUSTUS (2026),,,,,,,,,",
    "TOTAL,,,,,31,,,,55999125432",
    "Row Labels,Kategori,PIC,Product Knowledge,Fs dan voc,Sample support,GMV max support,Linkshare,Open Endorsement,GMV TAP",
    "skintificid,Beauty,Aulia,,0.0,1.0,0.0,1.0,0.0,3041299332",
    "Scora,Beauty,Aulia,,0.0,0.0,0.0,0.0,0.0,900000000",
  ].join("\n");
  const metrics = buildBrandMetrics(metricsCsv);
  const { campaigns } = buildCampaignCatalog(
    csv(
      row({ no: "1", brand: "Skintific", category: "Beauty", rate: "8%", url: link("a") }),
      row({ no: "2", brand: "Scora", category: "Beauty", rate: "9%", url: link("b") }),
      row({ no: "3", brand: "Belum Terdata", category: "Beauty", rate: "7%", url: link("c") }),
    ),
    (brand) => lookupBrandMetric(brand, metrics),
  );
  const byBrand = Object.fromEntries(campaigns.map((item) => [item.brand, item]));
  assert.equal(byBrand.Skintific.hasSample, true, "ejaan handle toko tetap tersambung ke brand");
  assert.equal(byBrand.Scora.hasSample, false);
  assert.equal(byBrand["Belum Terdata"].hasSample, null, "tidak ada barisnya berarti belum diketahui, bukan tidak ada");
});

test("nilai GMV rupiah tidak pernah ikut ke objek campaign", () => {
  const metricsCsv = [
    "Row Labels,Kategori,PIC,Product Knowledge,Fs dan voc,Sample support,GMV max support,Linkshare,Open Endorsement,GMV TAP",
    "Scora,Beauty,Aulia,,0.0,1.0,0.0,0.0,0.0,3041299332",
  ].join("\n");
  const metrics = buildBrandMetrics(metricsCsv);
  const { campaigns } = buildCampaignCatalog(
    csv(row({ no: "1", brand: "Scora", category: "Beauty", rate: "9%", url: link("a") })),
    (brand) => lookupBrandMetric(brand, metrics),
  );
  const serialized = JSON.stringify(campaigns);
  assert.equal(/\d{9,}/.test(serialized), false, "hanya peringkat yang boleh keluar, bukan nilai rupiahnya");
  assert.equal(campaigns[0].gmvRank, 1);
});

test("nama brand Shopee dibersihkan tanpa mengubah identitas brand", () => {
  const url = "https://s.shopee.co.id/example";
  for (const [raw, expected] of [
    [`realme Authorized Store Tangerang ${url}`, "realme"],
    [`SKIN1004 New ${url}`, "SKIN1004"],
    [`Loreal Profesionnel Indonesia ${url}`, "L'Oréal Professionnel"],
    [`3CE ${url}`, "3CE"],
    [`2R & Memey Cosmetic ${url}`, "2R & Memey Cosmetic"],
  ]) {
    assert.equal(cleanShopeeBrand(raw, url), expected);
  }
});

test("fixture nyata menghasilkan katalog yang bisa dipakai", () => {
  const { campaigns } = buildCampaignCatalog(readFileSync("tests/fixtures/tiktok.csv", "utf8"));
  const purbasari = campaigns.find((item) => item.brand === "PURBASARI");
  // "8,10,11%" dulu ditolak karena ambigu untuk pertanyaan "rate berapa".
  // Untuk pertanyaan "paling kecil berapa", jawabannya tidak ambigu.
  assert.equal(purbasari?.commission, 8);
  assert.equal(campaigns.every((item) => item.id && item.brand), true);
});

test("brand dengan beberapa baris memakai komisi terkecil, bukan baris pertama", () => {
  // Bentuk yang sama dengan MLT, KAHI, dan WOSADO di sheet asli: baris pertama
  // bukan yang termurah, jadi mengambil indeks 0 akan menjanjikan angka
  // yang lebih besar daripada yang benar-benar didapat creator.
  const { campaigns } = buildCampaignCatalog(readFileSync("tests/fixtures/tiktok.csv", "utf8"));
  const multi = campaigns.find((item) => item.brand === "Multi Tier");
  assert.equal(multi?.commission, 7);
  assert.equal(multi?.campaignCount, 3);
});

test("parser tidak pernah menandai SKU baru dari sheet", () => {
  // Penandanya milik CMS. Kalau parser bisa menaikkannya, sebuah perubahan
  // kolom di sheet bisa diam-diam menyorot brand yang tidak diniatkan admin.
  const { campaigns } = buildCampaignCatalog(readFileSync("tests/fixtures/tiktok.csv", "utf8"));
  assert.equal(campaigns.length > 0, true);
  assert.equal(campaigns.every((item) => item.newSku === false), true);

  const shopee = buildShopeeCampaigns(readFileSync("tests/fixtures/shopee.csv", "utf8"));
  assert.equal(shopee.length > 0, true);
  assert.equal(shopee.every((item) => item.newSku === false), true);
});


test("format ringkasan: satu CSV gabungan TikTok+Shopee terbaca lewat kolom Platform", () => {
  const summary = readFileSync("tests/fixtures/summary.csv", "utf8");
  const { campaigns: tiktok, issues } = buildCampaignCatalog(summary);
  const shopee = buildShopeeCampaigns(summary);

  // Baris Shopee tidak ikut masuk ke katalog TikTok, dan sebaliknya.
  assert.equal(tiktok.length, 5);
  assert.equal(shopee.length, 3);
  assert.equal(issues.length, 0);
  assert.equal(tiktok.every((item) => item.platform === "TikTok Shop"), true);
  assert.equal(shopee.every((item) => item.platform === "Shopee Affiliate"), true);

  // Angka komisi di kolom ini sudah jadi nilai terkecil per brand, dipakai apa adanya.
  const skintific = tiktok.find((item) => item.brand === "Skintific");
  assert.equal(skintific?.commission, 8);
  assert.equal(skintific?.campaignCount, 6);
  // Jumlah tier tidak ikut mengklaim tahu komisi tiap tier — hanya satu angka
  // gabungan yang benar-benar diketahui.
  assert.deepEqual(skintific?.tierCommissions, [8]);

  // Komisi kosong tetap null, bukan 0 atau ditebak.
  const dorskin = tiktok.find((item) => item.brand === "Dorskin");
  assert.equal(dorskin?.commission, null);

  // Ya/Tidak/kosong pada "Punya Sample" terbaca sebagai true/false/null.
  assert.equal(tiktok.find((item) => item.brand === "Bagsmart")?.hasSample, true);
  assert.equal(tiktok.find((item) => item.brand === "Heasel")?.hasSample, null);
  assert.equal(shopee.find((item) => item.brand === "Advan")?.hasSample, false);

  // SKU baru dan berlaku hingga BOLEH datang dari format ini — beda dengan
  // sheet asli yang sama sekali tidak punya kolom itu.
  const newLaunch = tiktok.find((item) => item.brand === "New Launch");
  assert.equal(newLaunch?.newSku, true);
  assert.equal(newLaunch?.expiresAt, "31/12/2026");
  assert.equal(tiktok.find((item) => item.brand === "Heasel")?.newSku, false);

  // Special Live Price mengikuti kolomnya sendiri, per brand.
  assert.equal(shopee.find((item) => item.brand === "Anua")?.specialLivePrice, true);
  assert.equal(shopee.find((item) => item.brand === "Advan")?.specialLivePrice, false);

  // Tanpa kolom link, setiap campaign lahir tanpa TAP link — bukan berarti
  // brand-nya hilang dari katalog.
  assert.equal(tiktok.every((item) => typeof item.id === "string" && item.id.length > 0), true);
});

test("format ringkasan tidak pernah salah terbaca dari sheet asli, dan sebaliknya", () => {
  // Sheet asli tidak punya "Komisi (%)"/"Jumlah Tier"/"SKU Baru" sekaligus,
  // jadi harus tetap lewat jalur lama dengan validasi link seperti biasa.
  const { campaigns } = buildCampaignCatalog(readFileSync("tests/fixtures/tiktok.csv", "utf8"));
  assert.equal(campaigns.length > 0, true);

  // Sebaliknya, format ringkasan tidak boleh dibaca seolah sheet asli —
  // baris TikTok-nya tidak pernah mengandung link, jadi kalau sempat lewat
  // jalur lama, seluruh baris akan tertolak dan katalognya kosong.
  const { campaigns: summaryCampaigns } = buildCampaignCatalog(readFileSync("tests/fixtures/summary.csv", "utf8"));
  assert.equal(summaryCampaigns.length, 5);
});

test("format link Shopee: brand dan link affiliate sudah jadi kolom sendiri-sendiri", () => {
  const fixture = readFileSync("tests/fixtures/shopee-links.csv", "utf8");
  const shopee = buildShopeeCampaigns(fixture);

  // Baris tanpa link (Tanpa Link) tidak pernah masuk katalog.
  assert.equal(shopee.length, 3);
  assert.equal(shopee.every((item) => item.platform === "Shopee Affiliate"), true);
  // Shopee tidak pernah punya kolom komisi di format apa pun.
  assert.equal(shopee.every((item) => item.commission === null), true);
  assert.equal(shopee.every((item) => item.tierCommissions.length === 0), true);

  // Baseus muncul di dua baris: keduanya digabung jadi satu kartu, dan
  // jumlah campaign-nya menghitung kedua baris, bukan hanya satu.
  const baseus = shopee.find((item) => item.brand === "Baseus");
  assert.equal(baseus?.campaignCount, 2);
  // Sample "Tidak" di baris pertama tidak boleh mengalahkan "Ya" di baris
  // kedua — brand yang sama, jadi hasil akhirnya digabung lewat OR.
  assert.equal(baseus?.hasSample, true);
  assert.equal(baseus?.specialLivePrice, true);
  assert.equal(baseus?.category, "Tech");

  const glowin = shopee.find((item) => item.brand === "Glowin");
  assert.equal(glowin?.campaignCount, 1);
  assert.equal(glowin?.hasSample, true);
  assert.equal(glowin?.specialLivePrice, true);

  // Kategori dipakai apa adanya: format ini sudah memakai nama tampilan
  // final ("Home & Living"), bukan kode singkat sheet asli ("hla").
  const expired = shopee.find((item) => item.brand === "Kadaluarsa Brand");
  assert.equal(expired?.category, "Home & Living");
  assert.equal(expired?.expiresAt, "31/12/2026");
  assert.equal(expired?.hasSample, false);
  assert.equal(expired?.newSku, true);

  assert.equal(shopee.some((item) => item.brand === "Tanpa Link"), false);
});

test("format link Shopee tidak pernah salah terbaca dari sheet asli maupun format ringkasan, dan sebaliknya", () => {
  // Sheet asli dan format ringkasan sama-sama tidak punya "Status Kadaluarsa",
  // jadi keduanya tidak boleh pernah masuk jalur format link Shopee.
  const legacy = buildShopeeCampaigns(readFileSync("tests/fixtures/shopee.csv", "utf8"));
  assert.equal(legacy.length > 0, true);
  assert.equal(legacy.every((item) => item.tierCommissions.length === 0), true);

  const summaryShopee = buildShopeeCampaigns(readFileSync("tests/fixtures/summary.csv", "utf8"));
  assert.equal(summaryShopee.length, 3);

  // Sebaliknya: format link Shopee tidak pernah dibaca lewat jalur TikTok —
  // tidak ada "TAP LINK"/"CREATOR COMMISSION" di sini, jadi katalog TikTok-nya
  // harus kosong, bukan diam-diam salah membaca kolom Link sebagai TAP link.
  const { campaigns: tiktokRead } = buildCampaignCatalog(readFileSync("tests/fixtures/shopee-links.csv", "utf8"));
  assert.equal(tiktokRead.length, 0);
});
