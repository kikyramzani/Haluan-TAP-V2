import { expect, test } from "@playwright/test";
import { logout, register } from "./helpers/auth";
import { watchForBugs } from "./helpers/bugs";
import {
  cleanupBrandsByKeyPrefix,
  cleanupCatalogFixtures,
  cleanupSampleRequests,
  cleanupUsersByEmails,
  completeCreatorProfileAndVerify,
  completeOnboarding,
  findBrandByKeyPrefix,
  promoteToSuperAdmin,
  readBrandById,
  resetRateLimitScope,
  seedCatalogFixtures,
  seedSampleRequestFor,
  setUserRole,
  type CatalogFixtures,
} from "./helpers/db";

/**
 * Perjalanan super admin lewat CMS sungguhan: buat brand, sunting, buat
 * campaign, isi tier + link, kelola kategori (baca), verifikasi/tolak/pulihkan
 * kreator, proses antrean sample sampai selesai dan tolak satu, gabungkan
 * brand, promosikan pengguna, audit, analitik, import (pratinjau), keluar.
 *
 * Aturan katalog: setiap brand yang dibuat di sini berawalan `E2E Journey`
 * sehingga brandKey-nya `e2ejourney…` (brandKey membuang non-alfanumerik), dan
 * dibersihkan di afterAll.
 * Kategori nyata tidak pernah disunting.
 */

let phoneCounter = 0;
const uniquePhone = () => `0812${String(Date.now()).slice(-8)}${++phoneCounter}`;
const emailsToClean: string[] = [];
const requestIds: string[] = [];
let fixtures: CatalogFixtures;

test.beforeAll(async () => { fixtures = await seedCatalogFixtures(); });
test.beforeEach(async () => {
  for (const scope of ["register-ip", "verify-confirm-ip", "register-account", "login-account", "login-ip", "sample"]) await resetRateLimitScope(scope);
  test.skip(test.info().project.name !== "desktop-chromium", "perjalanan penuh cukup satu proyek");
});
test.afterAll(async () => {
  await cleanupSampleRequests(requestIds);
  await cleanupBrandsByKeyPrefix("e2ejourney");
  await cleanupCatalogFixtures();
  await cleanupUsersByEmails(emailsToClean);
});

test("perjalanan super admin: brand → campaign → tier/link → kreator → antrean sample → merge → pengguna → audit", async ({ page }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const creatorEmail = `e2e-journey-target-${stamp}@example.com`;
  const adminEmail = `e2e-journey-admin-${stamp}@example.com`;
  emailsToClean.push(creatorEmail, adminEmail);

  // Kreator sasaran: terdaftar, onboarding selesai, dua request sample menunggu.
  await register(page, { name: "Target Kreator", email: creatorEmail, phone: uniquePhone() });
  await completeOnboarding(creatorEmail);
  await completeCreatorProfileAndVerify(creatorEmail);
  const reqA = await seedSampleRequestFor(creatorEmail, { status: "PENDING", brandName: fixtures.single.displayName });
  const reqB = await seedSampleRequestFor(creatorEmail, { status: "PENDING", brandName: fixtures.multiTier.displayName });
  requestIds.push(reqA.id, reqB.id);
  await page.goto("/dashboard");
  await logout(page);

  // Super admin.
  await register(page, { name: "Journey Admin", email: adminEmail, phone: uniquePhone() });
  await completeOnboarding(adminEmail);
  await promoteToSuperAdmin(adminEmail);
  const bugs = watchForBugs(page);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Halo, Admin/ })).toBeVisible();

  // 1. Brand baru.
  const brandName = `E2E Journey Brand ${stamp}`;
  await page.goto("/admin/brand/new");
  await page.locator('input[name="displayName"]').fill(brandName);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Simpan brand" }).click();
  // BrandForm mendorong ke daftar sesudah sukses; daftar itu berhalaman dan
  // tanpa pencarian, jadi brand barunya dicari lewat basis data.
  await page.waitForURL(/\/admin\/brand$/);
  const created = await findBrandByKeyPrefix(`e2ejourneybrand${stamp}`);
  expect(created, "brand baru tidak ditemukan di basis data").not.toBeNull();
  const brandUrl = `/admin/brand/${created!.id}`;
  await page.goto(brandUrl);
  await expect(page.locator('input[name="displayName"]')).toHaveValue(brandName);

  // 2. Sunting brand: unggulan.
  await page.locator('input[name="featured"]').check();
  await page.getByRole("button", { name: "Simpan brand" }).click();
  await page.waitForTimeout(500);
  await page.goto(brandUrl);
  await expect(page.locator('input[name="featured"]')).toBeChecked();

  // 3. Campaign baru untuk brand itu. Pilihan brand baru aktif sesudah admin
  //    mencari (?q=) — dengan 684 brand, dropdown penuh memang sengaja dihindari.
  await page.goto(`/admin/campaign/new?q=${encodeURIComponent(brandName)}`);
  await page.locator('select[name="brandId"]').selectOption({ label: brandName });
  await page.locator('select[name="platform"]').selectOption("TIKTOK_SHOP");
  await page.locator('select[name="commissionType"]').selectOption("PERSENTASE");
  await page.getByRole("button", { name: "Buat campaign" }).click();
  // `/admin/campaign/new?q=…` juga cocok dengan `[^/]+$` — kecualikan "new".
  await page.waitForURL((url) => /^\/admin\/campaign\/(?!new$)[^/]+$/.test(url.pathname));
  const campaignUrl = page.url();

  // 4. Sunting campaign + tier/link.
  await page.locator('textarea[name="brief"], input[name="brief"]').first().fill("Brief uji perjalanan admin");
  await page.locator('input[name="sampleQuota"]').fill("3");
  /**
   * Kuota saja TIDAK membuka sample — itu keluhan yang memicu perbaikan ini.
   * hasSample adalah kolom terpisah, dan sampai ada field ini tidak ada satu
   * pun permukaan admin yang menulisnya.
   */
  await page.locator('select[name="hasSample"]').selectOption("yes");
  await page.getByRole("button", { name: "Simpan campaign" }).click();
  await page.waitForTimeout(500);
  await page.goto(campaignUrl);
  await expect(page.locator('textarea[name="brief"], input[name="brief"]').first()).toHaveValue("Brief uji perjalanan admin");
  await expect(page.locator('select[name="hasSample"]')).toHaveValue("yes");

  /**
   * Regresi yang akan dibawa checkbox: menyimpan form TANPA menyentuh field
   * sample sama sekali tidak boleh mengubah nilainya. Checkbox yang tidak
   * dicentang tidak terkirim di FormData dan tidak terbedakan dari "belum
   * ditentukan", sehingga satu penyimpanan biasa akan menulis false ke ratusan
   * campaign yang sebenarnya belum dinilai.
   */
  await page.locator('input[name="displayOrderWeight"]').fill("1");
  await page.getByRole("button", { name: "Simpan campaign" }).click();
  await page.waitForTimeout(500);
  await page.goto(campaignUrl);
  await expect(page.locator('select[name="hasSample"]')).toHaveValue("yes");
  await page.getByLabel("Komisi tier 1").fill("12");
  await page.getByLabel("Link tier 1").fill("https://affiliate.example.com/e2e-journey");
  await page.locator("button.submit-btn[type=button]").first().click();
  await page.waitForTimeout(700);
  await page.goto(campaignUrl);
  await expect(page.getByLabel("Link tier 1")).toHaveValue("https://affiliate.example.com/e2e-journey");

  // 5. Daftar campaign + tab-tabnya merender.
  await page.goto(`/admin/campaign?q=${encodeURIComponent("E2E Journey")}`);
  await expect(page.getByText(brandName)).toBeVisible();
  for (const [href, h1] of [["/admin/campaign/produk", "Daftar tier campaign"], ["/admin/campaign/link", "Daftar link campaign"], ["/admin/campaign/kategori", "Kelola kategori brand"]]) {
    await page.goto(href);
    await expect(page.getByRole("heading", { name: h1 })).toBeVisible();
  }

  // 6. Kreator: verifikasi → tolak → pulihkan.
  await page.goto(`/admin/creator?q=${encodeURIComponent(creatorEmail)}`);
  await page.locator("tr", { hasText: "Target Kreator" }).getByRole("link", { name: "Detail" }).click();
  await expect(page).toHaveURL(/\/admin\/creator\/[^/]+$/);
  const creatorUrl = page.url();
  await page.getByRole("button", { name: "Tolak / Reject" }).scrollIntoViewIfNeeded();
  await page.locator('[name="reason"]').fill("Uji penolakan perjalanan admin");
  await page.getByRole("button", { name: "Tolak / Reject" }).click();
  await expect(page.getByText(/Uji penolakan perjalanan admin|REJECTED|Ditolak/).first()).toBeVisible();
  await page.goto(creatorUrl);
  await page.getByRole("button", { name: /Kembalikan ke Pending/ }).click();
  await expect(page.getByRole("button", { name: "Verifikasi" })).toBeVisible();
  await page.getByRole("button", { name: "Verifikasi" }).click();
  // VERIFIED: tombol Verifikasi hilang, yang tersedia Suspend (konfirmasi dua langkah).
  await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verifikasi" })).toHaveCount(0);
  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("button", { name: "Ya, tangguhkan" }).click();
  await expect(page.getByRole("button", { name: /Kembalikan ke Pending/ })).toBeVisible();
  await page.getByRole("button", { name: /Kembalikan ke Pending/ }).click();
  await expect(page.getByRole("button", { name: "Verifikasi" })).toBeVisible();

  // 7. Antrean sample: setujui → kirim → selesai; yang kedua ditolak.
  await page.goto(`/admin/sample/${reqA.id}`);
  await page.locator('[name="approveNote"]').fill("Disetujui lewat perjalanan admin");
  await page.getByRole("button", { name: "Setujui" }).click();
  await expect(page.locator(".admin-status")).toContainText(/Disetujui/);
  await page.locator('[name="carrier"]').fill("JNE");
  await page.locator('[name="trackingNumber"]').fill("JNE1234567890");
  await page.getByRole("button", { name: "Tandai terkirim" }).click();
  await expect(page.locator(".admin-status")).toContainText(/Dikirim/);
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(page.locator(".admin-status")).toContainText(/Selesai/);

  await page.goto(`/admin/sample/${reqB.id}`);
  await page.locator('[name="rejectionReason"]').fill("Kuota habis untuk uji");
  await page.getByRole("button", { name: "Tolak" }).click();
  await expect(page.locator(".admin-status")).toContainText(/Ditolak/);

  // 8. Merge brand: brand kedua dibuat, brand pertama digabungkan ke sana.
  const targetName = `E2E Journey Target ${stamp}`;
  await page.goto("/admin/brand/new");
  await page.locator('input[name="displayName"]').fill(targetName);
  await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Simpan brand" }).click();
  await page.waitForURL(/\/admin\/brand/);
  await page.goto(brandUrl);
  // MergeForm menerima NAMA brand tujuan sebagai teks; kuncinya diturunkan server.
  await page.locator('input[name="targetBrandKey"]').fill(targetName);
  // ConfirmButton dua langkah: "Gabungkan" → "Ya, gabungkan".
  await page.getByRole("button", { name: "Gabungkan" }).click();
  await page.getByRole("button", { name: "Ya, gabungkan" }).click();
  await page.waitForTimeout(700);
  // Daftar brand berhalaman; hasil gabungan diverifikasi dari basis data:
  // brand asal disembunyikan dan menunjuk ke brand tujuan.
  const target = await findBrandByKeyPrefix(`e2ejourneytarget${stamp}`);
  expect(target, "brand tujuan tidak ditemukan").not.toBeNull();
  await expect.poll(async () => readBrandById(created!.id)).toMatchObject({ hidden: true, mergedIntoId: target!.id });

  // 9. Pengguna & peran, audit, analitik, import.
  // /admin/pengguna hanya mendaftar ADMIN dan SUPER_ADMIN; kreator sasaran
  // dijadikan ADMIN dulu supaya kedua kontrol perannya bisa diuji.
  await setUserRole(creatorEmail, "ADMIN");
  await page.goto("/admin/pengguna");
  await expect(page.getByRole("heading", { name: "Pengguna & peran" })).toBeVisible();
  const targetRow = page.locator("tr", { hasText: creatorEmail });
  await targetRow.getByRole("button", { name: "Jadikan Super Admin" }).click();
  await expect(targetRow.getByRole("button", { name: "Turunkan ke Creator" })).toBeVisible();
  await targetRow.getByRole("button", { name: "Turunkan ke Creator" }).click();
  await targetRow.getByRole("button", { name: "Ya, turunkan" }).click();
  await expect(page.locator("tr", { hasText: creatorEmail })).toHaveCount(0);

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText(/membership|creator\.|sample/i).first()).toBeVisible();
  await page.goto("/admin/analitik");
  await expect(page.getByRole("heading", { name: "Performa 30 hari terakhir" })).toBeVisible();
  await page.goto("/admin/import");
  await expect(page.getByRole("heading", { name: "Import data brand" })).toBeVisible();

  // 10. Keluar.
  await logout(page);
  await expect(page).not.toHaveURL(/\/admin/);

  expect(bugs.findings(), bugs.findings().join("\n")).toEqual([]);
});
