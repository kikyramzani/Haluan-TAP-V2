import { expect, test, type Page } from "@playwright/test";
import { logout, register, ADMIN_EMAIL } from "./helpers/auth";
import { cleanupUsersByEmails, completeOnboarding, promoteToSuperAdmin, resetRateLimitScope } from "./helpers/db";

// Needed explicitly for API-only requests before any page.goto() has
// happened. Page.url() is "about:blank" at that point, which does not
// produce a usable Origin header for sameOrigin() (lib/security.ts).
const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;

/**
 * Rewritten from scratch for Phase 9 of the rebuild plan. The pre-rebuild
 * version of this file tested a single-page /admin with a client-side
 * tab-switcher (buttons like "Database Kreator", "Katalog Campaign"). That
 * whole UI was deleted in an earlier phase. The admin is now a real
 * multi-route app under /admin/*, gated by a single requireAdmin() call in
 * app/admin/layout.tsx, with a sidebar nav in app/admin/AdminNav.tsx. Every
 * route, nav label, and heading string below was read directly from the
 * current source, not carried over from the old suite.
 *
 * ADMIN vs. SUPER_ADMIN is a boundary the old suite never actually tested,
 * it only had one undifferentiated "admin" role. ADMIN_EMAILS (see
 * playwright.config.ts) allowlists exactly one email, admin@tap.test, so
 * that shared fixture account is the only account that can ever be a plain
 * ADMIN in this environment. It is used here to prove the *negative* case
 * (blocked from the 3 Super-Admin-only routes) and is deliberately never
 * promoted or otherwise mutated, since other spec files rely on it staying
 * a plain ADMIN across the whole suite run (see helpers/db.ts's
 * promoteToSuperAdmin comment and how auth-operations.spec.ts uses it). The
 * *positive* case (a promoted account can reach all 3) uses a throwaway
 * account instead. ReconcileAdminRole() short-circuits and returns the
 * user as-is once role is already "super_admin" (lib/auth.ts), so
 * promoteToSuperAdmin() on a non-allowlisted email is sufficient on its own,
 * no allowlist entry required.
 */

const emailsToClean: string[] = [];

// register-ip/verify-confirm-ip (IP-scoped) and register-account (scoped by
// the shared admin@tap.test address itself, reused across many separate
// runs while debugging). See auth-operations.spec.ts's beforeEach for why
// this resets every test rather than once per file.
test.beforeEach(async () => {
  await resetRateLimitScope("register-ip");
  await resetRateLimitScope("verify-confirm-ip");
  await resetRateLimitScope("register-account");
  await resetRateLimitScope("login-account");
  await resetRateLimitScope("login-ip");
});

test.afterAll(async () => {
  await cleanupUsersByEmails(emailsToClean);
});

/**
 * admin@tap.test may already exist from another spec file that ran earlier
 * in this same worker (the suite runs against the real dev Postgres, which
 * persists across spec files. See playwright.config.ts's top comment).
 * Probing existence via a raw POST /api/auth/register is NOT safe. That
 * endpoint has a real side effect (creates the account on its very first
 * "does it exist" call, leaving a half-registered, never-verified row that
 * then makes every later real register() attempt fail as a duplicate),
 * confirmed the hard way while rewriting auth-operations.spec.ts's
 * sample-lifecycle test against this exact account. /api/auth/login has no
 * such side effect, so it's the actual existence probe.
 */
async function loginAsSharedAdmin(page: Page) {
  const loginProbe = await page.request.post("/api/auth/login", { headers: { origin }, data: { email: ADMIN_EMAIL, password: "Password2026" } });
  if (!loginProbe.ok()) await register(page, { name: "Admin Workspace QA", email: ADMIN_EMAIL, phone: `0812${String(Date.now()).slice(-8)}` });
}

// [href, nav label, expected <h1> text] for every route in AdminNav's MAIN_ITEMS.
const MAIN_ROUTES: Array<[string, string, string]> = [
  ["/admin", "Ringkasan", "Halo, Admin"],
  ["/admin/brand", "Brand", "Kelola brand"],
  ["/admin/campaign", "Campaign", "Kelola campaign"],
  ["/admin/produk", "Produk", "Daftar tier campaign"],
  ["/admin/link", "Link", "Daftar link campaign"],
  ["/admin/kategori", "Kategori", "Kelola kategori brand"],
  ["/admin/creator", "Creator", "Database kreator"],
  ["/admin/sample", "Sample", "Antrean request sample"],
  ["/admin/analitik", "Analitik", "Performa 30 hari terakhir"],
];

// [href, expected <h1> text once reachable] for AdminNav's SUPER_ADMIN_ITEMS.
const SUPER_ADMIN_ROUTES: Array<[string, string]> = [
  ["/admin/pengguna", "Pengguna & peran"],
  ["/admin/audit", "Audit log"],
  ["/admin/import", "Import data brand"],
];

test("admin biasa melihat sidebar lengkap dan kesembilan rute utama merender judul aslinya", async ({ page }) => {
  await loginAsSharedAdmin(page);
  await page.goto("/admin");

  const sidebar = page.locator("aside.admin-sidebar");
  await expect(sidebar).toBeVisible();

  // The creator-facing bottom tab bar used to be unconditional root-layout
  // markup with no route awareness. It rendered on top of every admin page
  // at mobile width until MobileNav.tsx added its own /admin bail-out.
  await expect(page.locator(".mobile-nav")).toHaveCount(0);

  // Plain ADMIN (not super_admin) must not see the 3 Super-Admin-only links -
  // AdminNav only renders the SUPER ADMIN block when isSuperAdmin is true.
  for (const [href] of SUPER_ADMIN_ROUTES) {
    await expect(sidebar.locator(`a.nav-link[href="${href}"]`)).toHaveCount(0);
  }

  for (const [href, label, heading] of MAIN_ROUTES) {
    const link = sidebar.locator(`a.nav-link[href="${href}"]`);
    await expect(link, `nav link untuk ${label}`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));
    await expect(page.getByRole("heading", { level: 1 }), `h1 di ${href}`).toHaveText(heading);
  }
});

test("creator biasa tidak bisa mengakses tiga rute khusus super admin lewat URL langsung", async ({ page }) => {
  const email = `admin-nav-creator-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Creator Bukan Admin", email, phone: `08123458${Date.now().toString().slice(-4)}` });
  // Otherwise the redirect this test checks for chains one hop further, into
  // /dashboard's own onboarding gate (app/dashboard/layout.tsx). Not what
  // this test is about.
  await completeOnboarding(email);

  // requireAdmin() gates the whole /admin/* subtree in app/admin/layout.tsx
  // before any page-specific super_admin check runs, so a non-admin creator
  // hits the same general redirect here as it does for /admin itself
  // (already covered by auth-operations.spec.ts's authorization-boundary
  // test). This confirms that guard also covers the 3 super-admin routes
  // specifically, not just the root.
  for (const [href] of SUPER_ADMIN_ROUTES) {
    await page.goto(href);
    await expect(page, `${href} untuk creator biasa`).toHaveURL(/\/dashboard\?error=forbidden/);
    await expect(page.getByText("Akses admin tidak tersedia.")).toBeVisible();
  }
});

test("admin biasa (bukan super admin) diblokir dari tiga rute khusus, akun yang dipromosikan bisa mengaksesnya", async ({ page }) => {
  // Negative case: the shared admin@tap.test fixture is ADMIN via the
  // allowlist and is never promoted anywhere in this suite, so it is a safe,
  // stable stand-in for "a real admin that is not a super admin".
  await loginAsSharedAdmin(page);
  for (const [href] of SUPER_ADMIN_ROUTES) {
    await page.goto(href);
    await expect(page, `${href} untuk admin biasa`).toHaveURL(/\/admin\?error=forbidden/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo, Admin");
  }

  // Positive case: a throwaway account promoted directly to SUPER_ADMIN
  // (never added to ADMIN_EMAILS) proves the boundary is really about the
  // super_admin role, not some other property of the shared fixture account.
  const superEmail = `admin-nav-super-${Date.now()}@tap.test`;
  emailsToClean.push(superEmail);
  const superContext = await page.context().browser()!.newContext({ baseURL: origin });
  const superPage = await superContext.newPage();
  await register(superPage, { name: "Super Admin Nav QA", email: superEmail, phone: `08123459${Date.now().toString().slice(-4)}` });
  await promoteToSuperAdmin(superEmail);

  await superPage.goto("/admin");
  const superSidebar = superPage.locator("aside.admin-sidebar");
  for (const [href, heading] of SUPER_ADMIN_ROUTES) {
    await expect(superSidebar.locator(`a.nav-link[href="${href}"]`), `nav link ${href} untuk super admin`).toBeVisible();
    await superPage.goto(href);
    await expect(superPage, href).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}$`));
    await expect(superPage.getByRole("heading", { level: 1 }), `h1 di ${href}`).toHaveText(heading);
  }
  await superContext.close();
});

test("pencarian brand tanpa hasil menampilkan empty state, bukan tabel kosong diam-diam", async ({ page }) => {
  await loginAsSharedAdmin(page);
  await page.goto("/admin/brand");
  await page.locator('input[name="q"]').fill("brand-yang-benar-benar-tidak-ada-di-database");
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page.getByText("Belum ada brand yang cocok dengan filter ini.")).toBeVisible();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1); // just the empty-state row
});

test("template CSV import bisa diunduh dan langsung lolos pratinjau tanpa error", async ({ page }) => {
  // /admin/import is super-admin-only (see SUPER_ADMIN_ROUTES above), so this
  // needs a promoted throwaway account, not the shared plain-ADMIN fixture.
  const superEmail = `admin-import-template-${Date.now()}@tap.test`;
  emailsToClean.push(superEmail);
  const superContext = await page.context().browser()!.newContext({ baseURL: origin });
  const superPage = await superContext.newPage();
  await register(superPage, { name: "Import Template QA", email: superEmail, phone: `08123460${Date.now().toString().slice(-4)}` });
  await promoteToSuperAdmin(superEmail);

  await superPage.goto("/admin/import");
  const templateLink = superPage.getByRole("link", { name: "Unduh template CSV" });
  await expect(templateLink).toHaveAttribute("href", "/data/brand-import-template.csv");

  const templateResponse = await superPage.request.get("/data/brand-import-template.csv");
  expect(templateResponse.ok()).toBe(true);
  const templateCsv = await templateResponse.text();

  // Round-trip: the template's own content, pasted back in, must parse clean -
  // proving the header names actually match what buildPreview() expects. Not
  // asserting the exact Baru/Diperbarui split: the template's example row
  // ("MS Glow") is a real brand name that may already exist in this shared
  // dev catalog, which would legitimately classify it as an update instead of
  // new. That's not a parse failure, so only Gagal (and total rows) matter.
  await superPage.locator('textarea[name="csv"]').fill(templateCsv);
  await superPage.getByRole("button", { name: "Pratinjau" }).click();
  await expect(superPage.getByRole("heading", { name: "3 baris dibaca" })).toBeVisible();
  const kpis = superPage.locator(".admin-stats .kpi");
  await expect(kpis.filter({ hasText: "Gagal" }).locator("dd")).toHaveText("0");

  await superContext.close();
});

test("logout dari admin kembali ke beranda publik, dan /admin tidak lagi bisa diakses tanpa login", async ({ page, baseURL }) => {
  await loginAsSharedAdmin(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo, Admin");

  await logout(page);
  await expect(page).toHaveURL(`${baseURL}/`);

  // requireAdmin() sends an unauthenticated visitor to /admin/login (not
  // /daftar, which is the creator-facing form). See lib/auth.ts's comment
  // on why the admin entry point is deliberately separate.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
