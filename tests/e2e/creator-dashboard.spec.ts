import { expect, test } from "@playwright/test";
import { logout, register } from "./helpers/auth";
import {
  cleanupCatalogFixtures,
  cleanupUsersByEmails,
  completeCreatorProfileAndVerify,
  completeOnboarding,
  resetRateLimitScope,
  seedCatalogFixtures,
  type CatalogFixtures,
} from "./helpers/db";

// Phone numbers must be unique per real account (prisma/schema.prisma's
// User.phone) — a hardcoded literal reused across separate runs against this
// same real dev Postgres collides with whatever an earlier run already
// claimed. See tests/e2e/auth-operations.spec.ts for the same fix.
let phoneCounter = 0;
function uniquePhone() {
  // The LAST digits of Date.now() are what actually vary between calls a few
  // ms apart — slicing from the front instead kept the stable leading part
  // and produced near-duplicate phones, defeating the point. A counter is
  // layered on top since two calls in the same synchronous tick can still
  // share a millisecond.
  phoneCounter += 1;
  return `0812${String(Date.now()).slice(-8)}${phoneCounter}`;
}

/**
 * Rewritten from scratch for Phase 9 of the rebuild plan. The pre-rebuild
 * version of this file (87 lines) tested a single flat /dashboard page with
 * a `#profile` hash-anchor tab and an inline ProfileForm.tsx — both gone.
 * The creator dashboard is now a real multi-route app under /dashboard/*
 * (see app/dashboard/DashboardNav.tsx for the route list), gated by
 * app/dashboard/layout.tsx on BOTH being signed in AND having finished
 * /daftar/lengkapi. That second gate is new and load-bearing: register()
 * alone does not satisfy it (Creator.onboardingCompletedAt stays null until
 * the onboarding form itself is submitted — see
 * app/daftar/lengkapi/actions.ts), so every test here either drives that
 * form for real (the main creator-journey test below) or calls
 * completeOnboarding() (helpers/db.ts, added this session, same
 * direct-Prisma pattern as completeCreatorProfileAndVerify) to satisfy the
 * gate without re-testing that same form in every scenario.
 *
 * Routes that had zero e2e coverage before this rewrite — /dashboard/sample,
 * /dashboard/tersimpan, and /dashboard/profil's tabs — are covered here for
 * the first time. The Alamat tab's cascading wilayah selects are the one
 * deliberate gap: completeCreatorProfileAndVerify() already exercises that
 * exact wilayah chain at the Prisma level for the sample-request tests, and
 * driving the same cascading UI here too would mostly re-test that select
 * behavior rather than any dashboard-specific guarantee.
 */

const emailsToClean: string[] = [];
let fixtures: CatalogFixtures;

test.beforeAll(async () => {
  fixtures = await seedCatalogFixtures();
});

// register-ip (6/hour) and verify-confirm-ip (10/hour) — see
// auth-operations.spec.ts's beforeEach for why this resets every test.
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

test("kreator baru wajib menyelesaikan onboarding sebelum dashboard terbuka, lalu overview menyapa dan sesi terlihat di halaman publik", async ({ page }) => {
  const email = `onboarding-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Dian Kreator", email, phone: uniquePhone() });

  // register()'s own assertion only proves a session exists — it does not
  // promise the account is onboarded. Creator.onboardingCompletedAt is still
  // null right after registration, so app/dashboard/layout.tsx redirects the
  // very next /dashboard render to /daftar/lengkapi. This is the gate this
  // test exists to prove, not just assume.
  await expect(page).toHaveURL(/\/daftar\/lengkapi/);
  await expect(page.getByRole("heading", { name: /Lengkapi profil/ })).toBeVisible();

  // Any /dashboard/* sub-route hits the exact same gate, not just the root.
  await page.goto("/dashboard/sample");
  await expect(page).toHaveURL(/\/daftar\/lengkapi/);

  await page.getByRole("checkbox").first().check(); // kategori konten pertama yang tersedia
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: /Lanjut ke dashboard/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Overview: sapaan nama depan dan status akun yang jujur untuk akun yang
  // benar-benar baru — nol di semua statistik, bukan angka tebakan.
  await expect(page.getByRole("heading", { name: /Halo, Dian\./ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Lihat deal aktif/ })).toBeVisible();
  await expect(page.locator(".admin-stats article", { hasText: "Sample Request" }).locator("strong")).toHaveText("0");
  await expect(page.locator(".admin-stats article", { hasText: "Sample Approved" }).locator("strong")).toHaveText("0");
  await expect(page.locator(".admin-stats article", { hasText: "Saved Campaign" }).locator("strong")).toHaveText("0");

  // Header publik pada halaman lain harus tahu sesi ini sudah masuk: tidak
  // ada lagi ajakan "Daftar" atau "Gabung sekarang" untuk orang yang sudah
  // masuk. ".nav-session" sengaja disembunyikan lewat CSS di bawah 600px
  // (digantikan navigasi bawah mobile), jadi diperiksa lewat atribut, bukan
  // toBeVisible() — supaya berkas ini tetap benar dijalankan di proyek mobile.
  await page.goto("/deals");
  await expect(page.locator(".nav-session")).toHaveAttribute("href", "/dashboard");
  await expect(page.locator(".nav-session")).toContainText("Dian");
  await expect(page.getByRole("link", { name: "Daftar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Gabung sekarang" })).toHaveCount(0);

  // Logout mengembalikan ke home publik, dan dashboard tidak lagi bisa diakses.
  // The "Keluar" button only exists inside /dashboard's own header, not on
  // public pages like /deals — logout() needs to be called from there.
  await page.goto("/dashboard");
  await logout(page);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/daftar\?mode=login/);
});

test("/dashboard/profil: menyimpan tab Data Pribadi bertahan setelah reload", async ({ page }) => {
  const email = `profil-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Profil Kreator", email, phone: uniquePhone() });
  await completeOnboarding(email);

  // Data Pribadi adalah tab aktif bawaan (lihat app/dashboard/profil/ProfilTabs.tsx),
  // jadi tidak perlu klik tab lain untuk mencapainya.
  await page.goto("/dashboard/profil");
  const nickname = `E2E Nickname ${Date.now()}`;
  await page.getByLabel("Panggilan").fill(nickname);
  await page.getByRole("button", { name: "Simpan Data Pribadi" }).click();
  await expect(page.getByText(/Tersimpan\./)).toBeVisible();

  // Reload penuh membuktikan datanya benar-benar tersimpan di Postgres, bukan
  // cuma state optimis di klien.
  await page.reload();
  await expect(page.getByLabel("Panggilan")).toHaveValue(nickname);
});

test("/dashboard/tersimpan: kosong jujur di awal, lalu terisi setelah menyimpan campaign dari halaman deal", async ({ page }) => {
  const email = `tersimpan-${Date.now()}@tap.test`;
  emailsToClean.push(email);
  await register(page, { name: "Tersimpan Kreator", email, phone: uniquePhone() });
  await completeOnboarding(email);

  await page.goto("/dashboard/tersimpan");
  await expect(page.getByText("Belum ada campaign tersimpan.")).toBeVisible();

  // fixtures.single: brand e2e- berbayang, aman disimpan/dihapus berulang
  // tanpa pernah menyentuh 691 brand asli di katalog.
  await page.goto(`/deal/${fixtures.single.campaigns[0].slug}`);
  await page.getByRole("button", { name: "Simpan campaign" }).click();
  await expect(page.getByRole("button", { name: "Tersimpan" })).toBeVisible();

  await page.goto("/dashboard/tersimpan");
  const savedCard = page.locator(".deal-card").filter({ hasText: fixtures.single.displayName });
  await expect(savedCard).toBeVisible();

  // Menghapus dari sini kembali ke keadaan kosong yang sama jujurnya.
  await savedCard.getByRole("button", { name: `Hapus ${fixtures.single.displayName} dari tersimpan` }).click();
  await expect(page.getByText("Belum ada campaign tersimpan.")).toBeVisible();
});

test("/dashboard/sample: request sample tampil dengan status yang benar dan bisa dibatalkan sendiri saat PENDING", async ({ page }) => {
  const email = `sample-${Date.now()}@tap.test`;
  const phone = uniquePhone();
  emailsToClean.push(email);
  await register(page, { name: "Sample Kreator", email, phone });
  await completeOnboarding(email);
  // checkSampleGate() (lib/requests.ts) requires BOTH a verified membership
  // AND a complete address — completeCreatorProfileAndVerify() sets up both
  // in one direct-Prisma write, same pattern auth-operations.spec.ts uses
  // for the sample lifecycle test.
  await completeCreatorProfileAndVerify(email);

  // page.request (not the standalone `request` fixture) shares the browser
  // context's cookies, needed both to reach the gate as this creator and to
  // pass the same-origin check every mutating route enforces.
  const created = await page.request.post("/api/sample-requests", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      brand: fixtures.single.displayName,
      platform: "TikTok",
      username: "samplekreator",
      profileUrl: "https://www.tiktok.com/@samplekreator",
      recipientName: "Sample Kreator",
      phone,
      address: "Jl. Sample QA Nomor 1 Jakarta",
      commitment: true,
    },
  });
  const createdBody = await created.json();
  expect(created.status(), JSON.stringify(createdBody)).toBe(201);

  await page.goto("/dashboard/sample");
  const card = page.locator(".sample-request-card").filter({ hasText: fixtures.single.displayName });
  await expect(card).toBeVisible();
  await expect(card.locator(".admin-status")).toHaveText("Menunggu");

  await card.getByRole("button", { name: "Batalkan request" }).click();
  await expect(card.getByText(/Request ini dibatalkan/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Batalkan request" })).toHaveCount(0);
});

test("link request sample dari halaman deal dan dari modal katalog membawa brand yang sama", async ({ page }) => {
  // Publik murni — hasil href-nya tidak bergantung pada sesi, jadi tidak
  // perlu akun kreator untuk membuktikannya (beda dari test-test di atas).
  const expectedHref = `/request-sample?brand=${encodeURIComponent(fixtures.single.displayName)}&platform=TikTok`;

  // Dari halaman deal penuh. Header dan footer punya link "Request sample"
  // polos juga, jadi dicocokkan lewat panah "↗" yang hanya dipakai versi
  // berisi brand ini (lihat app/deal/[campaignId]/page.tsx).
  await page.goto(`/deal/${fixtures.single.campaigns[0].slug}`);
  await expect(page.getByRole("link", { name: "Request sample ↗" })).toHaveAttribute("href", expectedHref);

  // Dari modal katalog untuk brand yang sama (app/components/CampaignSheet.tsx)
  // — brand dan platform harus ikut terisi otomatis di halaman tujuan juga.
  await page.goto("/deals");
  await page.getByLabel("Cari brand atau campaign").fill(fixtures.single.displayName);
  await page.locator(".deal-card").filter({ hasText: fixtures.single.displayName }).getByRole("button", { name: /Dapatkan komisi/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Request sample/ })).toHaveAttribute("href", expectedHref);
});
