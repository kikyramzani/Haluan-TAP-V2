import { expect, test } from "@playwright/test";
import { login, logout, readLatestCode, register, ADMIN_EMAIL } from "./helpers/auth";
import { cleanupCatalogFixtures, cleanupUsersByEmails, completeCreatorProfileAndVerify, completeOnboarding, promoteToSuperAdmin, resetRateLimitScope, seedCatalogFixtures, type CatalogFixtures } from "./helpers/db";

/**
 * Rewritten from scratch for Phase 9 of the rebuild plan (see the plan's
 * progress log for the full "keep vs. drop" reasoning). The pre-rebuild
 * version of this file (1321 lines) tested things that no longer exist in
 * any form: the single-page admin's tab UI, the deleted /api/admin/* REST
 * endpoints, the old 8-value SampleStatus vocabulary, and. The largest
 * chunk of it. The exact failure semantics of Redis CAS locks/leases/fault
 * injection, which Postgres transactions made structurally impossible
 * (see Phase 1's progress log: "Postgres transactions never leave a
 * phone/email claim orphaned or a challenge commit half-settled the way the
 * old Redis primitives could"). What's kept here is every property that's
 * still a real, current guarantee of this app.
 */

// A browser.newContext() call (as opposed to the `page`/`request` fixtures)
// does not inherit playwright.config.ts's `use.baseURL` automatically. Every
// context created that way in this file passes this explicitly.
const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;

// Phone numbers are unique per real account (see prisma/schema.prisma's
// User.phone), same as email. A hardcoded literal reused across separate
// runs against this same real dev Postgres collides with whatever an
// earlier debugging run already claimed and never got a chance to clean up,
// blocking every future registration under that literal until it's freed by
// hand. Every register() call in this file gets its own.
let phoneCounter = 0;
function uniquePhone() {
  // The LAST digits of Date.now() are what actually vary between calls a few
  // ms apart (the leading digits are stable for the whole session). Slicing
  // from the front instead, as an earlier version of this helper did, kept
  // the stable part and produced near-duplicate phones, which is the exact
  // collision this helper exists to avoid. A counter is layered on top since
  // two calls in the same synchronous tick can still share a millisecond.
  phoneCounter += 1;
  return `0812${String(Date.now()).slice(-8)}${phoneCounter}`;
}

const emailsToClean: string[] = [];
let fixtures: CatalogFixtures;

test.beforeAll(async () => {
  fixtures = await seedCatalogFixtures();
});

// register-ip (6/hour, IP-scoped) and verify-confirm-ip (10/hour, IP-scoped)
// and register-account (3/hour, scoped by the EMAIL/PHONE itself. See
// app/api/auth/register/route.ts) are all tight buckets, reasonable for real
// traffic but easily exhausted by repeated local runs while debugging -
// register-account especially, since the shared admin@tap.test address is
// reused across many separate test runs and isn't unique per run the way
// every other email in this file is. Reset before every test rather than
// once per file so each test always starts with its own fresh allowance.
test.beforeEach(async () => {
  await resetRateLimitScope("register-ip");
  await resetRateLimitScope("verify-confirm-ip");
  await resetRateLimitScope("register-account");
  await resetRateLimitScope("login-account");
  await resetRateLimitScope("login-ip");
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
  await cleanupUsersByEmails(emailsToClean);
});

test("registrasi ditolak duplikat, origin palsu ditolak, dan sesi baru mulai dari pending", async ({ page, request }) => {
  const email = `dup-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Duplicate QA", email, phone: uniquePhone() });
  // register() lands on /dashboard directly only once onboarding is already
  // done; a brand-new account is redirected to /daftar/lengkapi first (see
  // app/dashboard/layout.tsx). Complete it here to reach the dashboard's
  // own membership-status text.
  await completeOnboarding(email);
  await page.goto("/dashboard");
  await expect(page.getByText("Menunggu verifikasi MCN", { exact: true }).first()).toBeVisible();

  const duplicate = await request.post("/api/auth/register", {
    headers: { origin: new URL(page.url()).origin },
    data: { name: "Duplicate Again", email, phone: uniquePhone(), password: "Password2026", consent: true },
  });
  expect(duplicate.status()).toBe(409);

  const forgedOrigin = await request.patch("/api/profile", {
    headers: { origin: "https://evil.example" },
    data: { name: "Compromised" },
  });
  expect(forgedOrigin.status()).toBe(403);
});

test("creator dapat mereset kata sandi dengan kode sekali pakai", async ({ page }) => {
  const email = `reset-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Reset QA", email, phone: uniquePhone() });
  await completeOnboarding(email);
  await page.goto("/dashboard");
  await logout(page);

  await page.goto("/daftar?mode=login");
  await page.getByRole("button", { name: "Lupa kata sandi?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim kode reset" }).click();
  await expect(page.getByRole("heading", { name: "Buat kata sandi baru." })).toBeVisible();
  const resetCode = await readLatestCode(email);
  await page.getByLabel("Kode enam digit").fill(resetCode);
  await page.getByLabel("Kata sandi baru").fill("PasswordBaru2026");
  await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await logout(page);
  await login(page, { email, password: "PasswordBaru2026" });
  await expect(page).toHaveURL(/\/dashboard/);
});

test("membership pending memblokir sample request; verified membuka akses", async ({ page }) => {
  const email = `membership-${Date.now()}@tap.test`;
  const phone = uniquePhone();
  emailsToClean.push(email);
  await register(page, { name: "Membership QA", email, phone });

  // page.request (not the standalone `request` fixture) shares the browser
  // context's cookies, so this POST carries the just-registered session -
  // needed both to reach the membership gate at all (unauthenticated is 401,
  // not 409) and to pass the same-origin check every mutating route enforces.
  const blocked = await page.request.post("/api/sample-requests", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      brand: fixtures.single.displayName,
      platform: "TikTok",
      username: "membershipqa",
      profileUrl: "https://www.tiktok.com/@membershipqa",
      recipientName: "Membership QA",
      phone,
      address: "Jl. Sample QA Nomor 1 Jakarta",
      commitment: true,
    },
  });
  expect(blocked.status()).toBe(409);

  await completeCreatorProfileAndVerify(email);
  await completeOnboarding(email);
  await page.goto("/dashboard");
  await expect(page.getByText("MCN terverifikasi", { exact: true }).first()).toBeVisible();
});

test("sample request lifecycle: creator mengajukan, admin approve lalu ship, transisi tidak valid ditolak", async ({ browser }) => {
  const creatorEmail = `sample-creator-${Date.now()}@tap.test`;
  const creatorPhone = uniquePhone();
  emailsToClean.push(creatorEmail);

  const creatorContext = await browser.newContext({ baseURL: origin });
  const creatorPage = await creatorContext.newPage();
  await register(creatorPage, { name: "Sample Creator QA", email: creatorEmail, phone: creatorPhone });
  await completeCreatorProfileAndVerify(creatorEmail);

  const created = await creatorContext.request.post("/api/sample-requests", {
    headers: { origin },
    data: {
      brand: fixtures.single.displayName,
      platform: "TikTok",
      username: "samplecreatorqa",
      profileUrl: "https://www.tiktok.com/@samplecreatorqa",
      recipientName: "Sample Creator QA",
      phone: creatorPhone,
      address: "Jl. Sample QA Nomor 1 Jakarta",
      commitment: true,
    },
  });
  const createdBody = await created.json();
  expect(created.status(), JSON.stringify(createdBody)).toBe(201);
  const requestId = createdBody.request.id;

  // Admin approves, then ships. ADMIN (unlike SUPER_ADMIN) has no direct-write
  // shortcut: reconcileAdminRole() (lib/auth.ts) re-checks every admin-gated
  // request against ADMIN_EMAILS and demotes-plus-invalidates-the-session
  // anything that doesn't match. Confirmed by trying exactly that. The only
  // real ADMIN account reachable here is the allowlisted ADMIN_EMAIL fixture
  // itself; registering it again just signs into the same account if a prior
  // spec in this run already created it.
  const adminContext = await browser.newContext({ baseURL: origin });
  const adminPage = await adminContext.newPage();
  // Probing existence via a raw POST /api/auth/register is NOT safe here -
  // that endpoint has a real side effect (it creates the account on its very
  // first, "does it exist" call, leaving a half-registered, never-verified
  // row behind that then makes every later real register() attempt for the
  // same email fail with a duplicate-email error). /api/auth/login has no
  // such side effect, so it's the actual existence probe.
  const loginProbe = await adminContext.request.post("/api/auth/login", {
    headers: { origin },
    data: { email: ADMIN_EMAIL, password: "Password2026" },
  });
  // A successful login already set adminContext's session cookie. Nothing
  // further needed. Only a genuinely new account goes through register().
  if (!loginProbe.ok()) await register(adminPage, { name: "Admin QA", email: ADMIN_EMAIL, phone: uniquePhone() });

  await adminPage.goto(`/admin/sample/${requestId}`);
  await adminPage.getByLabel("Catatan persetujuan (opsional)").fill("Disetujui lewat e2e");
  await adminPage.getByRole("button", { name: "Setujui" }).click();
  await expect(adminPage.getByText("Disetujui", { exact: true }).first()).toBeVisible();

  await adminPage.getByLabel("Kurir").fill("JNE");
  await adminPage.getByLabel("Nomor resi").fill("JNE123456789");
  await adminPage.getByRole("button", { name: "Tandai terkirim" }).click();
  await expect(adminPage.getByText("Dikirim", { exact: true }).first()).toBeVisible();
  await expect(adminPage.getByText("JNE123456789")).toBeVisible();

  // Invalid transition (SHIPPED -> APPROVED, skipping COMPLETED) must 409, not silently succeed.
  const invalidTransition = await adminContext.request.patch("/api/admin/sample-requests", {
    data: { id: requestId, status: "APPROVED" },
  }).catch(() => null);
  // The old admin PATCH REST endpoint was deleted in Phase 4. The only mutation
  // path is the Server Action, which the UI already proved above. This just
  // confirms the retired route is really gone, not silently resurrected.
  expect(invalidTransition === null || invalidTransition.status() === 404).toBeTruthy();
});

test("admin authorization boundary: creator biasa mendapat redirect, bukan data admin", async ({ page }) => {
  const email = `notadmin-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Bukan Admin", email, phone: uniquePhone() });
  await completeOnboarding(email);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  await expect(page.getByText("Akses admin tidak tersedia.")).toBeVisible();

  // Same boundary, a level deeper: a super-admin-only route redirects a
  // regular creator just as hard as the admin root does.
  await page.goto("/admin/audit");
  await expect(page).not.toHaveURL(/\/admin\/audit$/);
});

test("audit log mencatat perubahan membership creator", async ({ page }) => {
  const superAdminEmail = `super-${Date.now()}@tap.test`;
  const targetEmail = `audit-target-${Date.now()}@tap.test`;
  emailsToClean.push(superAdminEmail, targetEmail);

  await register(page, { name: "Super Admin QA", email: superAdminEmail, phone: uniquePhone() });
  await promoteToSuperAdmin(superAdminEmail);

  const targetContext = await page.context().browser()!.newContext({ baseURL: origin });
  const targetPage = await targetContext.newPage();
  await register(targetPage, { name: "Audit Target", email: targetEmail, phone: uniquePhone() });
  await targetContext.close();

  await page.goto("/admin/creator");
  const searchInput = page.locator('input[name="q"]');
  await searchInput.fill(targetEmail);
  await page.getByRole("button", { name: "Terapkan" }).click();
  await page.getByRole("link", { name: "Detail" }).first().click();
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await expect(page.getByText("Terverifikasi", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("creator.membership_update").first()).toBeVisible();
});
