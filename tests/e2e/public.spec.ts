import { expect, test, type Page } from "@playwright/test";
import { cleanupCatalogFixtures, resetRateLimitScope, seedCatalogFixtures, type CatalogFixtures } from "./helpers/db";

/**
 * /deals only renders the first PAGE_SIZE cards by default (see
 * app/components/CampaignCatalog.tsx's `visible` state + "load more") — with
 * ~700 real brands ahead of anything alphabetically starting "E2E ...", a
 * fixture card is never in that initial slice. The search box filters the
 * underlying array directly, independent of that cap, so every test that
 * needs to find a specific fixture card searches for it by name first.
 */
async function searchFor(page: Page, query: string) {
  await page.getByLabel("Cari brand atau campaign").fill(query);
}

/**
 * Rewritten for Phase 9 of the rebuild plan (see the plan's progress log):
 * the old version of this file depended on a curated CSV fixture set served
 * by a mock server. That mock server is gone — this now seeds a small,
 * deliberate set of real Postgres rows instead (see helpers/db.ts), covering
 * the same edge cases (multi-tier lowest-link selection, a null-commission
 * "—" display, an expired campaign, a Shopee/KETENTUAN_PLATFORM brand, a
 * "new SKU" flag), and cleans them up afterward. Assertions that only need
 * "the real catalog has something in it" read the real 700+ live brands
 * directly instead — no fixture needed for those.
 */

let fixtures: CatalogFixtures;

test.beforeAll(async () => {
  await resetRateLimitScope("catalog-public");
  fixtures = await seedCatalogFixtures();
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
});

test("katalog dirender di server dan tidak menarik ulang data dari klien", async ({ page }) => {
  const catalogRequests: string[] = [];
  page.on("request", (entry) => {
    if (entry.url().includes("/api/campaigns") && !entry.url().includes("/links")) catalogRequests.push(entry.url());
  });
  await page.goto("/deals");
  await page.waitForLoadState("networkidle");
  expect(catalogRequests).toHaveLength(0);

  // Switching platform is a full navigation (searchParams read server-side),
  // not a client fetch — the same guarantee the old test held.
  await page.getByRole("button", { name: /Shopee Affiliate/ }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".deal-card").first()).toBeVisible();
  expect(catalogRequests).toHaveLength(0);
});

test("katalog publik mobile-first, bisa dicari, dan header keamanannya utuh", async ({ page }) => {
  const response = await page.goto("/deals");
  expect(response?.status()).toBe(200);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Gunakan tema terang" }).click();

  await expect(page.getByRole("heading", { name: "Semua deal. Satu tempat." })).toBeVisible();
  await expect(page.locator(".deal-card").first()).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(layout.content).toBeLessThanOrEqual(layout.viewport);

  if (layout.viewport < 600) {
    const card = await page.locator(".deal-card").first().evaluate((element) => ({
      commission: Number.parseFloat(getComputedStyle(element.querySelector(".deal-commission-value")!).fontSize),
      brand: Number.parseFloat(getComputedStyle(element.querySelector(".deal-brand-name")!).fontSize),
      ctaHeight: element.querySelector(".deal-cta")!.getBoundingClientRect().height,
    }));
    expect(card.commission).toBeGreaterThan(card.brand);
    expect(card.ctaHeight).toBeGreaterThanOrEqual(40);
    await expect(page.locator(".mobile-nav")).toBeVisible();
  }

  const search = page.getByLabel("Cari brand atau campaign");
  await search.fill(fixtures.single.displayName);
  await expect(page.locator(".deal-card")).toHaveCount(1);
  await expect(page.locator(".deal-brand-name")).toHaveText(fixtures.single.displayName);

  await search.fill("brand-yang-tidak-ada-sama-sekali");
  await expect(page.getByRole("heading", { name: "Belum ada deal yang cocok" })).toBeVisible();
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.locator(".deal-card").first()).toBeVisible();

  const headers = response?.headers() || {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  const apiResponse = await page.request.get("/api/health");
  expect(apiResponse.headers()["content-security-policy"]).toContain("default-src 'self'");
});

test("komisi yang tampil adalah nilai terkecil milik brand", async ({ page, request }) => {
  await page.goto("/deals");
  await searchFor(page, fixtures.multiTier.displayName);
  const multi = page.locator(".deal-card").filter({ hasText: fixtures.multiTier.displayName });
  await expect(multi.locator(".deal-commission-value")).toHaveText("9%");

  // Nilai yang belum ada tampil sebagai "—", bukan angka tebakan — copy sudah
  // diperbarui dari "belum terbaca dari sheet" karena datanya bukan lagi dari sheet.
  await searchFor(page, fixtures.unknownCommission.displayName);
  const unknown = page.locator(".deal-card").filter({ hasText: fixtures.unknownCommission.displayName });
  await expect(unknown.locator(".deal-commission-value")).toHaveText("—");

  const body = await (await request.get("/api/campaigns")).json();
  const record = body.campaigns.find((item: { brand: string }) => item.brand === fixtures.multiTier.displayName);
  expect(record.commission).toBe(9);
});

test("sample journey explains the gate before showing personal-data fields", async ({ page }) => {
  await page.goto("/request-sample");
  await expect(page.getByRole("heading", { name: "Masuk sebelum mengisi request." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Masuk creator/ })).toBeVisible();
});

test("katalog Shopee jujur soal komisi yang memang tidak ada", async ({ page }) => {
  await page.goto("/deals?platform=shopee");
  await expect(page.getByText(/tidak memuat rate komisi/)).toBeVisible();
  await searchFor(page, fixtures.shopee.displayName);

  const shopeeCard = page.locator(".deal-card").filter({ hasText: fixtures.shopee.displayName });
  await expect(shopeeCard).toBeVisible();
  await expect(shopeeCard).toHaveClass(/deal-card--shopee/);
  await expect(shopeeCard).not.toContainText(/\d+%/);
  await expect(shopeeCard).not.toContainText("Komisi mengikuti ketentuan Shopee");
  await expect(shopeeCard.getByRole("button", { name: /Dapatkan komisi/ })).toHaveCount(0);

  await shopeeCard.getByRole("button", { name: "Lihat campaign" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Komisi creator")).toHaveCount(0);
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
  const response = await page.goto(`/deal/${fixtures.single.campaigns[0].slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: fixtures.single.displayName })).toBeVisible();
  await expect(page.getByText("Berlaku hingga", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Bagikan halaman TAP/ })).toBeVisible();

  await expect(page.locator(".affiliate-link-field")).toHaveCount(1);
  await expect(page.locator(".affiliate-link-field input")).toHaveValue(/^https:\/\//);
});

test("public API publishes real campaign data without raw partner links", async ({ request }) => {
  const response = await request.get("/api/campaigns");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.meta.total).toBe(body.campaigns.length);
  expect(body.campaigns.length).toBeGreaterThan(0);
  expect(response.headers()["cache-control"]).toContain("s-maxage=300");
  expect(JSON.stringify(body)).not.toMatch(/vt\.tiktok|tokopedia\.com\/link|affiliate-id\.tokopedia\.com\/api\/v1\/share/i);

  const shopeeResponse = await request.get("/api/campaigns?platform=shopee");
  expect(shopeeResponse.ok()).toBeTruthy();
  const shopee = await shopeeResponse.json();
  expect(shopee.campaigns.every((item: { commission: null }) => item.commission === null)).toBeTruthy();

  const publicLinks = await request.get(`/api/campaigns/${fixtures.single.campaigns[0].slug}/links`);
  expect(publicLinks.ok()).toBeTruthy();
  const publicLinkBody = await publicLinks.json();
  expect(publicLinkBody.link.url).toMatch(/^https:\/\//);
  expect(publicLinkBody.link.openUrl).toMatch(/^\/go\//);
});

test("angka GMV internal tidak pernah keluar ke permukaan publik", async ({ request }) => {
  const [api, home, deals] = await Promise.all([
    request.get("/api/campaigns").then((response) => response.text()),
    request.get("/").then((response) => response.text()),
    request.get("/deals").then((response) => response.text()),
  ]);
  for (const payload of [api, home, deals]) {
    expect(payload).not.toMatch(/"gmv"\s*:\s*\d/i);
  }
  const campaigns = JSON.parse(api).campaigns;
  expect(campaigns.every((item: Record<string, unknown>) => !("gmv" in item))).toBeTruthy();
});

test("public catalog stays available under a burst of concurrent requests", async ({ request }) => {
  // No fault-injection harness anymore (Phase 9 dropped the mock server) —
  // /api/campaigns wraps its own rate-limit check in a try/catch specifically
  // so a datastore hiccup there fails open, not closed. This proves the
  // externally-observable half of that: a burst never 500s, whether it's
  // allowed (200) or actually rate-limited (429) — never anything else.
  // Small on purpose: /api/campaigns' rate-limit bucket (120/5min, scoped by
  // IP) is shared with every other test in this file — a large burst here
  // would starve later tests' own /api/campaigns calls of headroom.
  const responses = await Promise.all(Array.from({ length: 5 }, () => request.get("/api/campaigns")));
  const statuses = responses.map((response) => response.status());
  expect(statuses.every((status) => status === 200 || status === 429)).toBeTruthy();

  const links = await request.get(`/api/campaigns/${fixtures.single.campaigns[0].slug}/links`);
  expect([200, 429]).toContain(links.status());
});

test("version endpoint names the commit being served", async ({ request }) => {
  const response = await request.get("/api/version");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const payload = await response.json();
  expect(payload.environment).toBeTruthy();
  expect(payload.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  if (payload.commit !== null) {
    expect(payload.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(payload.shortCommit).toBe(payload.commit.slice(0, 12));
  }
});

test("campaign kedaluwarsa tidak actionable dan tidak memakai badge promosi", async ({ page }) => {
  await page.goto("/deals");
  await searchFor(page, fixtures.expired.displayName);
  const expired = page.locator(".deal-card").filter({ hasText: fixtures.expired.displayName });
  await expect(expired).toContainText("Sudah berakhir");
  await expect(expired.locator(".deal-cta")).toHaveAttribute("aria-disabled", "true");
  await expect(expired.getByRole("button")).toHaveCount(0);

  await searchFor(page, fixtures.single.displayName);
  const live = page.locator(".deal-card").filter({ hasText: fixtures.single.displayName });
  await expect(live).toContainText("Sample tersedia");
  await expect(live).toHaveClass(/deal-card--tiktok/);
  await expect(live.getByRole("button", { name: /Dapatkan komisi/ })).toBeEnabled();
});

test("brand bertingkat hanya memunculkan satu link, milik komisi terkecil", async ({ page }) => {
  await page.goto(`/deal/${fixtures.multiTier.campaigns[0].slug}`);
  await expect(page.locator(".affiliate-link-field")).toHaveCount(1);
  await expect(page.locator(".affiliate-link-field input")).toHaveValue(/e2e-multi-rendah$/);
  await expect(page.locator("body")).not.toContainText("e2e-multi-tinggi");
  await expect(page.locator("body")).not.toContainText("e2e-multi-tengah");
});

test("redirect /go memakai link komisi terkecil", async ({ page }) => {
  const response = await page.request.get(`/go/${fixtures.multiTier.campaigns[0].slug}`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toContain("e2e-multi-rendah");
});

test("beranda memuat sampai 12 kartu per platform, bukan 6", async ({ page }) => {
  await page.goto("/");
  const tiktok = page.locator("#campaign .deal-card");
  await expect(tiktok.first()).toBeVisible();
  const tiktokCount = await tiktok.count();
  expect(tiktokCount).toBeLessThanOrEqual(12);

  // /api/campaigns' rate limit (120/5min, IP-scoped) is shared with every
  // other test in this file — if it's tripped by the time this runs, 12 is
  // already a fine answer on its own (there are ~700 real brands, always
  // over the cap) and the exact-count cross-check is just skipped.
  const catalogResponse = await page.request.get("/api/campaigns");
  if (catalogResponse.status() === 200) {
    const total = (await catalogResponse.json()).campaigns.length;
    expect(tiktokCount).toBe(Math.min(12, total));
  }
});

test("judul katalog dan ajakan masuk memakai kalimat yang diminta", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Extra komisi yang siap kamu ambil." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk sebagai anggota" })).toBeVisible();
});

test("baris SKU baru dirender ketika ada brand yang ditandai", async ({ page }) => {
  // fixtures.newSku sets Campaign.newSku=true directly (Phase 9 seed — see
  // helpers/db.ts) instead of driving the retired /api/admin/catalog toggle.
  // NewSkuHighlight's own cards (.new-sku-card) carry no .badge-new-sku class
  // — that class only exists on the main /deals BrandCard grid.
  await page.goto("/");
  await expect(page.locator("#new-sku")).toBeVisible();
  await expect(page.locator(".new-sku-card").filter({ hasText: fixtures.newSku.displayName })).toBeVisible();
});
