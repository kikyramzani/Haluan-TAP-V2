import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, register, ADMIN_EMAIL } from "./helpers/auth";
import { cleanupUsersByEmails, resetRateLimitScope } from "./helpers/db";

// Needed explicitly for the API-only login probe below, before any
// page.goto(). Page.url() is "about:blank" at that point, which does not
// produce a usable Origin header for sameOrigin() (lib/security.ts).
const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;

/**
 * `accessibility.spec.ts` only covers public routes reachable without a
 * session. Creator dashboard and admin workspace both need one. And the
 * dashboard additionally needs onboarding completed, since
 * app/dashboard/layout.tsx redirects any signed-in account without a
 * finished /daftar/lengkapi there before it ever renders dashboard content,
 * so both are audited here instead, each across every route its own nav
 * exposes (see app/dashboard/DashboardNav.tsx and app/admin/AdminNav.tsx),
 * in both themes. This is real expanded coverage: the pre-rebuild version of
 * this file only ever checked one dashboard view and six old single-page
 * admin tabs, neither of which exist anymore.
 *
 * Admin coverage here stays to AdminNav's 9 MAIN_ITEMS. The 3
 * SUPER_ADMIN_ITEMS (/admin/pengguna, /admin/audit, /admin/import) need a
 * super-admin promotion (helpers/db.ts's promoteToSuperAdmin) this file has
 * no other reason to set up, and the shared admin shell
 * (app/admin/layout.tsx. Sidebar, topbar, logout) wraps every /admin/*
 * route regardless of role, so the main-nav set already exercises that
 * shell fully. Better to cover the routes this file has real confidence in
 * than guess at the super-admin-only ones.
 */

const emailsToClean: string[] = [ADMIN_EMAIL];

test.beforeAll(async ({ browser }) => {
  await resetRateLimitScope("register-ip");
  await resetRateLimitScope("verify-confirm-ip");
  await resetRateLimitScope("register-account");
  await resetRateLimitScope("login-account");
  await resetRateLimitScope("login-ip");
  // admin@tap.test is the one address ADMIN_EMAILS (playwright.config.ts's
  // webServer) allowlists. Lib/auth.ts's reconcileAdminRole promotes it to
  // ADMIN the moment its email is verified. Registered once here, outside
  // any single test, so both theme runs below can log into the same
  // already-promoted account instead of racing each other to register it.
  // Probing existence via a raw POST /api/auth/register is unsafe (it has a
  // real side effect. See auth-operations.spec.ts's sample-lifecycle test
  // for the full story), so /api/auth/login is the actual existence probe;
  // this file's own afterAll normally leaves nothing behind, but a crashed
  // prior run could.
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  const loginProbe = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: ADMIN_EMAIL, password: "Password2026" } });
  if (!loginProbe.ok()) await register(page, { name: "Axe Admin", email: ADMIN_EMAIL, phone: `0812${String(Date.now()).slice(-8)}` });
  await context.close();
});

test.afterAll(async () => {
  await cleanupUsersByEmails(emailsToClean);
});

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.flatMap((node) => node.target) }));
}

/**
 * register() lands a brand-new account at /daftar/lengkapi, never straight
 * at /dashboard (see helpers/auth.ts). The dashboard layout's onboarding
 * gate redirects any first visit there. This drives the same fields
 * app/daftar/lengkapi/OnboardingForm.tsx renders: name and WhatsApp number
 * already arrive prefilled from registration, so a content category and
 * consent are the only new input. completeOnboarding()
 * (app/daftar/lengkapi/actions.ts) rejects the submission without at least
 * one category or without consent.
 */
async function completeOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/daftar\/lengkapi/);
  await page.locator('input[name="categoryIds"]').first().check();
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: "Lanjut ke dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/profil",
  "/dashboard/sample",
  "/dashboard/tersimpan",
  "/dashboard/performa",
  "/dashboard/notifikasi",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/brand",
  "/admin/campaign",
  "/admin/campaign/produk",
  "/admin/campaign/link",
  "/admin/campaign/kategori",
  "/admin/creator",
  "/admin/sample",
  "/admin/analitik",
];

for (const theme of ["dark", "light"] as const) {
  test(`dashboard creator bersih di semua rute, tema ${theme}`, async ({ page }) => {
    const email = `e2e-a11y-creator-${theme}-${Date.now()}@tap.test`;
    emailsToClean.push(email);
    await page.addInitScript((value) => window.localStorage.setItem("tap-theme", value), theme);

    await register(page, { name: "Axe Creator", email, phone: theme === "dark" ? "081234500101" : "081234500102" });
    await completeOnboarding(page);

    for (const route of DASHBOARD_ROUTES) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const found = await violations(page);
      expect(found, `pelanggaran pada ${route}`).toEqual([]);
    }
  });

  test(`admin workspace bersih di rute utama, tema ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => window.localStorage.setItem("tap-theme", value), theme);
    await login(page, { email: ADMIN_EMAIL });

    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const found = await violations(page);
      expect(found, `pelanggaran pada ${route}`).toEqual([]);
    }
  });
}
