// Named for what it is, so a local helper called `store` cannot shadow it —
// which it did, turning the constant into a reference to itself.
const storeUrl = `http://127.0.0.1:${process.env.MOCK_REDIS_PORT ?? 6381}`;
import { expect, test } from "@playwright/test";

test("katalog dirender di server dan tidak menarik ulang data dari klien", async ({ page, request }) => {
  const [homeResponse, dealsResponse] = await Promise.all([request.get("/"), request.get("/deals")]);
  expect(await homeResponse.text()).toContain("Mistine");
  expect(await dealsResponse.text()).toContain("Mistine");

  // Katalog ikut di HTML pertama. Tidak ada permintaan katalog kedua dari
  // browser, baik saat memuat maupun saat berpindah platform.
  const catalogRequests: string[] = [];
  page.on("request", (entry) => {
    if (entry.url().includes("/api/campaigns") && !entry.url().includes("/links")) catalogRequests.push(entry.url());
  });
  await page.goto("/deals");
  await page.waitForLoadState("networkidle");
  expect(catalogRequests).toHaveLength(0);

  await page.getByRole("button", { name: /Shopee Affiliate/ }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".deal-card").first()).toBeVisible();
  expect(catalogRequests).toHaveLength(0);
});

test("katalog publik mobile-first, bisa dicari, dan header keamanannya utuh", async ({ page }) => {
  const response = await page.goto("/deals");
  expect(response?.status()).toBe(200);

  // Gelap adalah tema bawaan; terang tetap satu klik dan bertahan setelah reload.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Gunakan tema terang" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Gunakan tema gelap" }).click();

  await expect(page.getByRole("heading", { name: "Semua deal. Satu tempat." })).toBeVisible();
  await expect(page.locator(".deal-card").first()).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  // Halaman tidak boleh bisa digeser ke samping di lebar mana pun.
  expect(layout.content).toBeLessThanOrEqual(layout.viewport);

  if (layout.viewport < 600) {
    const card = await page.locator(".deal-card").first().evaluate((element) => ({
      commission: Number.parseFloat(getComputedStyle(element.querySelector(".deal-commission-value")!).fontSize),
      brand: Number.parseFloat(getComputedStyle(element.querySelector(".deal-brand-name")!).fontSize),
      ctaHeight: element.querySelector(".deal-cta")!.getBoundingClientRect().height,
    }));
    // Komisi adalah angka yang paling dicari, jadi harus jadi yang terbesar.
    expect(card.commission).toBeGreaterThan(card.brand);
    expect(card.ctaHeight).toBeGreaterThanOrEqual(40);
    await expect(page.locator(".mobile-nav")).toBeVisible();
  }

  const search = page.getByLabel("Cari brand atau campaign");
  await search.fill("Glow Better");
  await expect(page.locator(".deal-card")).toHaveCount(1);
  await expect(page.locator(".deal-brand-name")).toHaveText("Glow Better");

  // Pencarian mengabaikan huruf besar-kecil dan mencakup nama campaign.
  await search.fill("victory care");
  await expect(page.locator(".deal-brand-name")).toHaveText("Secret Clean");

  await search.fill("brand-yang-tidak-ada");
  await expect(page.getByRole("heading", { name: "Belum ada deal yang cocok" })).toBeVisible();
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.locator(".deal-card").first()).toBeVisible();

  const headers = response?.headers() || {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  const prefetchResponse = await page.request.get("/", { headers: { purpose: "prefetch", "next-router-prefetch": "1" } });
  expect(prefetchResponse.headers()["content-security-policy"]).toContain("nonce-");
  const apiResponse = await page.request.get("/api/health");
  expect(apiResponse.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("komisi yang tampil adalah nilai terkecil milik brand", async ({ page, request }) => {
  // PURBASARI menulis komisinya sebagai daftar tier "8,10,11%". Pertanyaan
  // "rate-nya berapa" memang ambigu, tapi "paling kecil berapa" tidak.
  await page.goto("/deals");
  const purbasari = page.locator(".deal-card").filter({ hasText: "PURBASARI" });
  await expect(purbasari.locator(".deal-commission-value")).toHaveText("8%");

  // Sel yang tidak terbaca tampil sebagai "—", bukan angka tebakan.
  const unreadable = page.locator(".deal-card").filter({ hasText: "Kolom Geser" });
  await expect(unreadable.locator(".deal-commission-value")).toHaveText("—");
  await expect(unreadable).toContainText("Komisi belum terbaca dari sheet");

  const body = await (await request.get("/api/campaigns")).json();
  const record = body.campaigns.find((item: { brand: string }) => item.brand === "PURBASARI");
  expect(record.commission).toBe(8);
  expect(record.tierCommissions).toEqual([8]);
});

test("sample journey explains the gate before showing personal-data fields", async ({ page }) => {
  await page.goto("/request-sample");
  await expect(page.getByRole("heading", { name: "Masuk sebelum mengisi request." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Masuk creator/ })).toBeVisible();
  await expect(page.getByLabel("Alamat pengiriman")).toHaveCount(0);
});

test("katalog Shopee jujur soal komisi yang memang tidak ada", async ({ page }) => {
  await page.goto("/deals?platform=shopee");
  await expect(page.getByText(/tidak memuat rate komisi/)).toBeVisible();
  await expect(page.locator(".deal-card")).toHaveCount(4);

  // Shopee tidak punya kolom komisi, jadi kartunya memimpin dengan jumlah
  // campaign. Yang dijaga di sini: tidak ada satupun angka persen yang muncul,
  // karena angka semacam itu hanya bisa datang dari tebakan.
  const cards = await page.locator(".deal-card").allTextContents();
  expect(cards.some((text) => /\d+%/.test(text))).toBeFalsy();
  await expect(page.locator(".deal-card").first()).toContainText("Komisi mengikuti ketentuan Shopee");

  await page.getByLabel("Cari brand atau campaign").fill("Amaterasun");
  await expect(page.locator(".deal-brand-name")).toHaveText("Amaterasun");

  await page.locator(".deal-cta").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Ambil link affiliate/ })).toHaveAttribute("href", /^\/go\/shopee-/);
});

test("redirect errors are translated into actionable Indonesian messages", async ({ page }) => {
  await page.goto("/daftar?error=system_unavailable");
  await expect(page.getByText(/Sistem akun sedang tidak tersedia/)).toBeVisible();
  await page.goto("/deals?error=deal_unavailable");
  await expect(page.locator(".deal-card").first()).toBeVisible();
});

test("Google sign-in is visible when OAuth is configured", async ({ page }) => {
  await page.goto("/daftar?mode=login");
  await expect(page.locator(".google-button")).toBeVisible();
  await expect(page.locator(".google-button")).toHaveAttribute("href", /^\/api\/auth\/google\/start/);
});

test("public trust pages and custom 404 are available", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /Kebijakan Privasi/ })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /Ketentuan/ })).toBeVisible();
  const missing = await page.goto("/halaman-yang-tidak-ada");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /Halaman tidak ditemukan/ })).toBeVisible();
});

test("halaman brand memakai thumbnail lokal dan menampilkan tiap campaign", async ({ page }) => {
  const response = await page.goto("/deal/glow-better");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Glow Better" })).toBeVisible();
  await expect(page.locator(".brand-mark img")).toHaveAttribute("src", /glow-better\.png/);
  await expect(page.getByText("Berlaku hingga", { exact: true })).toBeVisible();
  await expect(page.getByText("31/12/2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bagikan halaman TAP/ })).toBeVisible();

  // Tiap campaign punya barisnya sendiri dengan link yang bisa disalin.
  await expect(page.locator(".affiliate-link-field")).toHaveCount(1);
  await expect(page.locator(".affiliate-link-field input")).toHaveValue(/^https:\/\//);

  const linkRowBox = await page.locator(".affiliate-link-field").first().boundingBox();
  const shareBox = await page.getByRole("button", { name: /Bagikan halaman TAP/ }).boundingBox();
  expect(linkRowBox!.y).toBeLessThan(shareBox!.y);
});

test("public API publishes real campaign data without raw partner links", async ({ request }) => {
  const response = await request.get("/api/campaigns");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.campaigns).toHaveLength(9);
  expect(body.meta.total).toBe(body.campaigns.length);
  expect(response.headers()["cache-control"]).toContain("s-maxage=300");
  expect(JSON.stringify(body)).not.toMatch(/TAP LINK|s\.shopee|vt\.tiktok|tokopedia/);
  // Sel yang tidak terbaca dilaporkan sebagai masalah data, bukan ditebak.
  expect(body.meta.excludedInvalidRates).toBeGreaterThan(0);
  expect(body.campaigns.find((item: { brand: string }) => item.brand === "Kolom Geser").commission).toBeNull();

  const shopeeResponse = await request.get("/api/campaigns?platform=shopee");
  expect(shopeeResponse.ok()).toBeTruthy();
  const shopee = await shopeeResponse.json();
  expect(shopee.campaigns).toHaveLength(4);
  // Shopee memang tidak punya kolom rate; nilainya null, bukan angka tebakan.
  expect(shopee.campaigns.every((item: { commission: null }) => item.commission === null)).toBeTruthy();
  expect(JSON.stringify(shopee)).not.toMatch(/shopee\.co\.id|shope\.ee|Form Pengajuan/);

  const publicLinks = await request.get(`/api/campaigns/${body.campaigns[0].id}/links`);
  expect(publicLinks.ok()).toBeTruthy();
  const publicLinkBody = await publicLinks.json();
  expect(publicLinkBody.link.url).toMatch(/^https:\/\//);
  expect(publicLinkBody.link.openUrl).toMatch(/^\/go\//);
});

test("angka GMV internal tidak pernah keluar ke permukaan publik", async ({ request }) => {
  // GMV dipakai hanya untuk mengurutkan. Nilai rupiahnya adalah data komersial
  // internal dan tidak boleh bisa dibaca dari response atau dari HTML.
  const [api, home, deals] = await Promise.all([
    request.get("/api/campaigns").then((response) => response.text()),
    request.get("/").then((response) => response.text()),
    request.get("/deals").then((response) => response.text()),
  ]);
  for (const payload of [api, home, deals]) {
    expect(payload).not.toMatch(/"gmv"\s*:\s*\d/i);
    expect(payload).not.toMatch(/GMV TAP/);
  }
  const campaigns = JSON.parse(api).campaigns;
  expect(campaigns.every((item: Record<string, unknown>) => !("gmv" in item))).toBeTruthy();
});

test("public catalog remains available when the rate-limit counter is down", async ({ request }) => {
  expect((await request.post(`${storeUrl}/__redis-down`)).status()).toBe(204);
  try {
    const response = await request.get("/api/campaigns");
    expect(response.status()).toBe(200);
    expect((await response.json()).campaigns.length).toBeGreaterThan(0);
    // Link etalase juga publik, jadi ikut fail-open bersama katalog.
    const links = await request.get("/api/campaigns/glow-better/links");
    expect(links.status()).toBe(200);
  } finally {
    expect((await request.post(`${storeUrl}/__redis-up`)).status()).toBe(204);
  }
});

test("version endpoint names the commit being served", async ({ request }) => {
  // Ties a green suite to a specific build. Without this, "tests passed" and "this is
  // what is live" are two claims with nothing joining them.
  const response = await request.get("/api/version");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const payload = await response.json();
  expect(payload.environment).toBeTruthy();
  expect(payload.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  // The commit is null in a plain local run and a full SHA on a deployment; both are
  // valid, a truncated or malformed value is not.
  if (payload.commit !== null) {
    expect(payload.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(payload.shortCommit).toBe(payload.commit.slice(0, 12));
  }
});

test("campaign kedaluwarsa tidak actionable dan tidak memakai badge promosi", async ({ page }) => {
  await page.goto("/deals");
  const cards = page.locator(".deal-card");

  // Kedaluwarsa mengalahkan urutan apa pun: komisi tertinggi di fixture justru
  // milik campaign yang sudah selesai, dan dia tetap turun ke paling bawah.
  await page.getByLabel("Urutkan").selectOption("commission-desc");
  await expect(cards.last()).toContainText("Sudah Lewat");

  const expired = cards.filter({ hasText: "Sudah Lewat" });
  await expect(expired).toContainText("Campaign sudah berakhir");
  await expect(expired.locator(".deal-cta")).toHaveAttribute("aria-disabled", "true");
  await expect(expired.getByRole("button")).toHaveCount(0);

  // Tanggal yang tidak terbaca dilaporkan, bukan disembunyikan, dan campaign-nya
  // tetap bisa dibuka.
  const unverified = cards.filter({ hasText: "Tanggal Aneh" });
  await expect(unverified).toContainText("Tanggal perlu verifikasi");
  await expect(unverified.getByRole("button", { name: /Dapatkan komisi/ })).toBeEnabled();

  const live = cards.filter({ hasText: "Mistine" });
  await expect(live).toContainText("Sample tersedia");
  await expect(live.getByRole("button", { name: /Dapatkan komisi/ })).toBeEnabled();
});

test("brand bertingkat hanya memunculkan satu link, milik komisi terkecil", async ({ page }) => {
  // Kartu menjanjikan angka terkecil, jadi link yang diberikan harus milik tier
  // yang sama. Kalau keduanya diambil dari sumber berbeda, halaman ini yang
  // pertama berbohong: rate 7% di judul, link tier 12% di kolom salin.
  await page.goto("/deal/multi-tier");

  const field = page.locator(".affiliate-link-field");
  await expect(field).toHaveCount(1);
  await expect(field.locator("input")).toHaveValue(/\/multi-rendah$/);

  // Tier yang lebih mahal tidak boleh bocor ke halaman dalam bentuk apa pun.
  await expect(page.locator("body")).not.toContainText("multi-tinggi");
  await expect(page.locator("body")).not.toContainText("multi-tengah");

  await expect(page.getByRole("link", { name: /Ambil link affiliate/ })).toHaveAttribute(
    "href",
    "/go/multi-tier",
  );
});

test("redirect /go memakai link komisi terkecil walau URL lama membawa varian", async ({ page }) => {
  // URL ber-?variant= sudah tersebar sebelum pilihan link dihapus. Yang lama
  // harus mendarat di link yang sekarang diiklankan kartu, bukan di tier acak.
  for (const path of ["/go/multi-tier", "/go/multi-tier?variant=0", "/go/multi-tier?variant=2"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toContain("/multi-rendah");
  }
});

test("beranda memuat sampai 12 kartu per platform, bukan 6", async ({ page }) => {
  // Preview yang terlalu pendek membuat creator harus pindah halaman hanya
  // untuk melihat brand keenam. Batasnya 12, dan fixture lebih kecil dari itu,
  // jadi yang terlihat di sini adalah seluruh isinya.
  await page.goto("/");
  const tiktok = page.locator("#campaign .deal-card");
  const shopee = page.locator("#campaign-shopee .deal-card");
  await expect(tiktok.first()).toBeVisible();

  const tiktokCount = await tiktok.count();
  const shopeeCount = await shopee.count();
  expect(tiktokCount).toBeGreaterThan(6);
  expect(tiktokCount).toBeLessThanOrEqual(12);
  expect(shopeeCount).toBeLessThanOrEqual(12);

  // Jumlah di beranda tidak boleh melebihi jumlah sebenarnya di katalog.
  const total = (await page.request.get("/api/campaigns").then((response) => response.json())).campaigns.length;
  expect(tiktokCount).toBe(Math.min(12, total));
});

test("judul katalog dan ajakan masuk memakai kalimat yang diminta", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Extra komisi yang siap kamu ambil." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk sebagai anggota" })).toBeVisible();
  await expect(page.getByText("Deal yang siap kamu ambil.")).toHaveCount(0);
  await expect(page.getByText("Sudah anggota? Masuk")).toHaveCount(0);
});

test("baris SKU baru tidak dirender selama belum ada yang ditandai", async ({ page }) => {
  // Section kosong berlabel "SKU baru" terbaca seperti data yang gagal dimuat.
  await page.goto("/");
  await expect(page.locator("#new-sku")).toHaveCount(0);
});

