import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Halaman deal dan tampilan masuk ikut diperiksa karena keduanya yang paling
// banyak berubah: field link affiliate, baris "Berlaku hingga", dan form auth.
const routes = [
  "/",
  "/deals",
  "/deals?platform=shopee",
  "/deal/glow-better",
  "/request-sample",
  "/daftar",
  "/daftar?mode=login",
  "/privacy",
  "/terms",
];

// Both themes, because a palette that only passes in the state a test happens to
// start in is a palette that has been checked once and shipped twice. The light
// theme is a first-class surface: it is one toggle away for every visitor.
for (const theme of ["dark", "light"] as const) {
  for (const route of routes) {
    test(`${route} has no serious accessibility violations in ${theme} theme`, async ({ page }) => {
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
    });
  }
}
