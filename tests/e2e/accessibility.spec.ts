import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cleanupCatalogFixtures, seedCatalogFixtures, type CatalogFixtures } from "./helpers/db";

/**
 * Rewritten for Phase 9 of the rebuild plan: the old version of this file
 * pointed at a fixture-only page (`/deal/glow-better`) served by the now-deleted
 * mock catalog. There is no fixture-only deal page anymore — every deal page is
 * a real Brand/Campaign row — so this seeds one small `e2e-`-prefixed brand
 * (see helpers/db.ts) purely to get a deal-page slug that exists deterministically,
 * and reads its own commission-tier/link content just like any other deal page.
 *
 * Halaman deal dan tampilan masuk ikut diperiksa karena keduanya yang paling
 * banyak berubah: field link affiliate, baris "Berlaku hingga", dan form auth.
 */

let fixtures: CatalogFixtures;

test.beforeAll(async () => {
  fixtures = await seedCatalogFixtures();
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
});

const STATIC_ROUTES = [
  "/",
  "/deals",
  "/deals?platform=shopee",
  "/request-sample",
  "/daftar",
  "/daftar?mode=login",
  "/privacy",
  "/terms",
];

async function auditRoute(page: Page, theme: "dark" | "light", route: string) {
  await page.addInitScript((value) => window.localStorage.setItem("tap-theme", value), theme);
  await page.goto(route);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  if (route.startsWith("/deals")) await expect(page.locator(".deal-card").first()).toBeVisible();
  if (route.startsWith("/deal/")) await expect(page.locator(".affiliate-link-field")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
  expect(violations).toEqual([]);
}

// Both themes, because a palette that only passes in the state a test happens to
// start in is a palette that has been checked once and shipped twice. The light
// theme is a first-class surface: it is one toggle away for every visitor.
for (const theme of ["dark", "light"] as const) {
  for (const route of STATIC_ROUTES) {
    test(`${route} has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
      await auditRoute(page, theme, route);
    });
  }

  // The deal-page route depends on a seeded slug, so it cannot live in
  // STATIC_ROUTES (that array is built before beforeAll has run). `fixtures`
  // is read inside the test body instead, which only executes afterward.
  test(`deal page has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
    await auditRoute(page, theme, `/deal/${fixtures.single.campaigns[0].slug}`);
  });
}
