import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cleanupCatalogFixtures, seedCatalogFixtures, type CatalogFixtures } from "./helpers/db";

/**
 * Rewritten for Phase 9 of the rebuild plan: the old version PATCHed the
 * now-deleted /api/admin/catalog route to flip `newSku` on a few real brands.
 * That route is gone, and mutating real brands is against the one hard rule
 * of this whole rebuild anyway. `seedCatalogFixtures()` (helpers/db.ts)
 * already includes `fixtures.newSku`, an `e2e-`-prefixed, ACTIVE,
 * non-expired campaign with `newSku: true`. Exactly what this file needs,
 * created and torn down without touching the real catalog.
 *
 * Two things are checked, and they are NOT the same DOM path:
 *
 * - `#new-sku` (app/components/NewSkuHighlight.tsx) is a dedicated homepage
 *   section fed by `[...tiktok, ...shopee].filter((c) => c.newSku)`
 *   (app/page.tsx). Any live newSku campaign, anywhere in the catalog, is
 *   enough to make it render. The seeded fixture alone guarantees that,
 *   independent of how many real newSku brands exist right now.
 * - `.badge-new-sku` (app/components/BrandCard.tsx) is a per-card badge on
 *   the regular `.deal-card` grid. NewSkuHighlight itself renders its own
 *   `.new-sku-card` markup and never emits `.badge-new-sku`. BrandCard only
 *   shows the top ~12 cards on `/` (sorted by commission, not by newSku), so
 *   the fixture is not guaranteed a slot there. Searching for the fixture's
 *   own brand name on `/deals` (the full, unpaginated-by-relevance catalog)
 *   narrows the grid down to exactly its own card, which deterministically
 *   carries the badge regardless of how the rest of the catalog ranks.
 */

let fixtures: CatalogFixtures;

test.beforeAll(async () => {
  fixtures = await seedCatalogFixtures();
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
});

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
}

for (const theme of ["dark", "light"] as const) {
  test(`beranda dengan baris SKU baru bersih di tema ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem("tap-theme", value), theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("#new-sku")).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test(`badge SKU baru pada kartu brand bersih di tema ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem("tap-theme", value), theme);
    await page.goto("/deals");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

    const search = page.getByLabel("Cari brand atau campaign");
    await search.fill(fixtures.newSku.displayName);
    const card = page.locator(".deal-card").filter({ hasText: fixtures.newSku.displayName });
    await expect(card).toHaveCount(1);
    await expect(card.locator(".badge-new-sku")).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });
}
