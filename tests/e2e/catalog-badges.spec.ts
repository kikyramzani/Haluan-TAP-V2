import { expect, test } from "@playwright/test";
import { cleanupCatalogFixtures, seedHotDealFixture } from "./helpers/db";

/**
 * Baris "Paling populer" di beranda dihapus; badge popularitasnya sekarang
 * menempel di kartu etalase, dengan chip filter di kontrol katalog.
 *
 * Fixture-nya menulis baris CampaignEngagementStat langsung, bukan menjalankan
 * cron malam. Spec tidak boleh bergantung pada adanya klik atau request sample
 * nyata di database bersama.
 *
 * Nama berkasnya sengaja bukan public/accessibility: playwright.config.ts
 * membatasi proyek mobile-webkit ke /(public|accessibility)\.spec\.ts/.
 */

let fixture: Awaited<ReturnType<typeof seedHotDealFixture>>;

test.beforeAll(async () => {
  fixture = await seedHotDealFixture();
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
});

async function searchFor(page: import("@playwright/test").Page, query: string) {
  await page.getByLabel("Cari brand atau campaign").fill(query);
}

/**
 * Di lebar ponsel keempat baris facet dilipat di balik tombol "Filter", jadi
 * chip-nya belum ada di pohon aksesibilitas sebelum tombol itu ditekan.
 *
 * Tombolnya sendiri yang jadi penanda, bukan lebar viewport: kalau ambang CSS-nya
 * berubah, helper ini ikut benar tanpa disentuh.
 */
async function openFacets(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /^Filter/ });
  if (await toggle.isVisible()) await toggle.click();
}

test("baris Hot Deals sudah tidak ada di beranda", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#hot-deals")).toHaveCount(0);
});

test("badge popularitas menempel di kartu etalase", async ({ page }) => {
  await page.goto("/deals");
  await searchFor(page, fixture.displayName);

  const card = page.locator(".deal-card").filter({ hasText: fixture.displayName });
  await expect(card).toBeVisible();
  // Regex, bukan kecocokan persis: badge-nya kini memuat ikon SVG di samping teks.
  await expect(card.locator(".badge-hot-top-brand")).toHaveText(/Brand pilihan/);
});

test("chip popularitas menyaring, dan hitungannya cocok dengan jumlah kartu", async ({ page }) => {
  await page.goto("/deals");
  await openFacets(page);
  const chip = page.locator('[aria-label="Filter popularitas"] .chip').filter({ hasText: "Brand pilihan" });
  await expect(chip).toBeVisible();
  await chip.click();

  const shown = Number(await page.locator(".result-line strong").innerText());
  // Jumlahnya jauh di bawah PAGE_SIZE (24), jadi semuanya dirender sekaligus.
  await expect(page.locator(".deal-card")).toHaveCount(shown);
  await expect(page.locator(".deal-card").filter({ hasText: fixture.displayName })).toBeVisible();
});

test("tidak ada kartu tanpa badge yang lolos saat filter popularitas aktif", async ({ page }) => {
  await page.goto("/deals");
  await openFacets(page);
  await page.locator('[aria-label="Filter popularitas"] .chip').filter({ hasText: "Brand pilihan" }).click();
  await expect(page.locator('.deal-card:not(:has([class*="badge-hot-"]))')).toHaveCount(0);
});

test("chip popularitas yang dirender selalu punya hitungan lebih dari nol", async ({ page }) => {
  await page.goto("/deals");
  await openFacets(page);
  // Menegaskan aturannya, bukan keadaan datanya: menuliskan "Trending tidak ada"
  // akan berbalik salah begitu cron benar-benar memberi badge itu.
  for (const count of await page.locator('[aria-label="Filter popularitas"] .chip-count').all()) {
    expect(Number(await count.innerText())).toBeGreaterThan(0);
  }
});

test("facet katalog dilipat di ponsel dan terbuka penuh tanpa menyembunyikan chip", async ({ page }, testInfo) => {
  await page.goto("/deals");
  const toggle = page.getByRole("button", { name: /^Filter/ });
  const facets = page.locator("#catalog-facets");

  if (!(await toggle.isVisible())) {
    // Desktop: tidak ada yang dilipat, facet harus selalu terlihat.
    await expect(facets).toBeVisible();
    return;
  }

  await expect(facets).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(facets).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  /**
   * Inti perbaikannya: saat terbuka, chip MEMBUNGKUS, bukan menggulir
   * horizontal. Sebelumnya tiap baris chip adalah scroller sendiri di dalam
   * halaman yang menggulir vertikal, dan chip di ujung kanan praktis tidak
   * pernah ditemukan. scrollWidth yang sama dengan clientWidth membuktikan
   * tidak ada isi yang terpotong.
   */
  for (const row of await page.locator("#catalog-facets .filter-chips").all()) {
    const box = await row.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
  }

  expect(testInfo.project.name).toContain("mobile");
});
