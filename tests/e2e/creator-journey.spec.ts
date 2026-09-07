import { expect, test } from "@playwright/test";
import { logout, register } from "./helpers/auth";
import { watchForBugs } from "./helpers/bugs";
import {
  cleanupCatalogFixtures,
  cleanupSampleRequests,
  cleanupUsersByEmails,
  readLatestSampleRequestFor,
  resetRateLimitScope,
  seedCatalogFixtures,
  verifyMembershipOnly,
  type CatalogFixtures,
} from "./helpers/db";

/**
 * Perjalanan creator dari ujung ke ujung, lewat UI sungguhan — bukan helper
 * basis data — di setiap langkah yang punya form: onboarding, empat tab
 * profil (termasuk pilihan wilayah bertingkat), simpan deal, tautan /go,
 * request sample dari profil, pembatalan, notifikasi, keluar.
 *
 * Detektor bug mengumpulkan galat konsol, pageerror, dan respons 5xx di
 * sepanjang perjalanan; daftarnya harus kosong di akhir.
 */

let phoneCounter = 0;
const uniquePhone = () => `0812${String(Date.now()).slice(-8)}${++phoneCounter}`;
const emailsToClean: string[] = [];
const requestIds: string[] = [];
let fixtures: CatalogFixtures;

test.beforeAll(async () => { fixtures = await seedCatalogFixtures(); });
test.beforeEach(async () => {
  for (const scope of ["register-ip", "verify-confirm-ip", "register-account", "login-account", "login-ip", "sample", "go-redirect"]) await resetRateLimitScope(scope);
  test.skip(test.info().project.name !== "desktop-chromium", "perjalanan penuh cukup satu proyek");
});
test.afterAll(async () => {
  await cleanupSampleRequests(requestIds);
  await cleanupCatalogFixtures();
  await cleanupUsersByEmails(emailsToClean);
});

test("perjalanan creator: onboarding → profil (4 tab) → deal → /go → sample dari profil → batal → notifikasi → keluar", async ({ page }) => {
  test.setTimeout(180_000);
  const bugs = watchForBugs(page);
  const email = `e2e-journey-creator-${Date.now()}@example.com`;
  emailsToClean.push(email);

  // 1. Daftar → onboarding lewat form sungguhan.
  await register(page, { name: "Journey Kreator", email, phone: uniquePhone() });
  await expect(page).toHaveURL(/\/daftar\/lengkapi/);
  await page.locator('input[name="categoryIds"]').first().check();
  await page.getByRole("checkbox", { name: /Saya menyetujui/ }).check();
  await page.getByRole("button", { name: "Lanjut ke dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Halo, Journey/ })).toBeVisible();

  // 2. Profil — tab Alamat dengan pilihan wilayah bertingkat.
  await page.goto("/dashboard/profil");
  await page.getByRole("tab", { name: "Alamat" }).click();
  const province = page.locator('select[name="provinceId"]');
  await expect(province).toBeVisible();
  await province.selectOption({ index: 1 });
  const regency = page.locator('select[name="regencyId"]');
  await expect.poll(async () => regency.locator("option").count()).toBeGreaterThan(1);
  await regency.selectOption({ index: 1 });
  const district = page.locator('select[name="districtId"]');
  await expect.poll(async () => district.locator("option").count()).toBeGreaterThan(1);
  await district.selectOption({ index: 1 });
  const village = page.locator('select[name="villageId"]');
  await expect.poll(async () => village.locator("option").count()).toBeGreaterThan(1);
  await village.selectOption({ index: 1 });
  await page.locator('[name="recipientName"]').fill("Journey Penerima");
  await page.locator('[name="detailAddress"]').fill("Jl. Perjalanan No. 7");
  await page.locator('[name="rt"]').fill("003");
  await page.locator('[name="rw"]').fill("004");
  await page.locator('[name="postalCode"]').fill("40111");
  await page.locator('[name="recipientPhone"]').fill("081299900011");
  await page.getByRole("button", { name: "Simpan Alamat" }).click();
  await expect(page.getByRole("status")).toContainText(/Tersimpan/);
  await page.reload();
  await expect(page.locator(".activation-score")).toContainText("100");

  // 3. Tab Social Media.
  await page.getByRole("tab", { name: /Social/ }).click();
  await page.locator('input[name="tiktokUsername"]').fill("journeykreator");
  await page.locator('input[name="tiktokFollowers"]').fill("1200");
  await page.getByRole("button", { name: "Simpan Social Media" }).click();
  await expect(page.getByRole("status")).toContainText(/Tersimpan/);
  await page.reload();
  await page.getByRole("tab", { name: /Social/ }).click();
  await expect(page.locator('input[name="tiktokUsername"]')).toHaveValue("journeykreator");

  // 4. Tab Kategori.
  await page.getByRole("tab", { name: "Kategori" }).click();
  const second = page.locator('input[name="categoryIds"]').nth(1);
  await second.check();
  await page.getByRole("button", { name: "Simpan Kategori" }).click();
  await expect(page.getByRole("status")).toContainText(/Tersimpan/);
  await page.reload();
  await page.getByRole("tab", { name: "Kategori" }).click();
  await expect(page.locator('input[name="categoryIds"]').nth(1)).toBeChecked();

  // 5. Deal: halaman detail, simpan, muncul di tersimpan.
  await page.goto(`/deal/${fixtures.single.campaigns[0].slug}`);
  await expect(page.getByRole("heading", { name: fixtures.single.displayName })).toBeVisible();
  await page.getByRole("button", { name: /Simpan campaign/ }).click();
  await expect(page.getByRole("button", { name: /Tersimpan|Hapus dari tersimpan/ })).toBeVisible();
  await page.goto("/dashboard/tersimpan");
  await expect(page.getByText(fixtures.single.displayName)).toBeVisible();

  // 6. /go mengalihkan ke tautan afiliasi.
  const go = await page.request.get(`/go/${fixtures.single.campaigns[0].slug}`, { maxRedirects: 0 });
  expect(go.status()).toBe(302);
  expect(go.headers()["location"]).toMatch(/^https:\/\/affiliate\.example\.com\//);
  await page.goto("/dashboard/performa");
  await expect(page.getByRole("heading", { name: "Klik link kamu" })).toBeVisible();

  // 7. Request sample dari profil — sesudah membership diverifikasi.
  await verifyMembershipOnly(email);
  await page.goto("/request-sample");
  const summary = page.getByTestId("shipping-summary");
  await expect(summary).toContainText("Journey Penerima");
  await expect(summary).toContainText("Jl. Perjalanan No. 7");
  await expect(summary).toContainText("40111");
  const form = page.locator("form");
  await form.locator('input[name="campaign"]').fill(`${fixtures.single.displayName} · TikTok`);
  // Username terisi dari profil sosial media yang baru disimpan.
  await expect(form.locator('input[name="username"]')).toHaveValue("journeykreator");
  await expect(form.locator('input[name="profile"]')).toHaveValue("https://www.tiktok.com/@journeykreator");
  await form.locator('input[name="commitment"]').check();
  await form.getByRole("button", { name: /Kirim request/ }).click();
  await expect(page.locator(".success-state")).toBeVisible();
  const saved = await readLatestSampleRequestFor(email);
  requestIds.push(saved!.id);
  expect(saved!.legacyAddressText).toContain("Jl. Perjalanan No. 7");

  // 8. Daftar sample: Menunggu → batalkan → Dibatalkan.
  await page.goto("/dashboard/sample");
  const card = page.locator(".sample-request-card").filter({ hasText: fixtures.single.displayName });
  await expect(card.locator(".admin-status")).toHaveText("Menunggu");
  await card.getByRole("button", { name: "Batalkan request" }).click();
  await expect(card.locator(".admin-status")).toHaveText("Dibatalkan");

  // 9. Notifikasi dan halaman lain merender.
  await page.goto("/dashboard/notifikasi");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Creator baru belum punya notifikasi: yang tampil empty state, bukan daftar
  // dengan tombol "Tandai semua". Keduanya sah; yang tidak sah adalah kosong.
  await expect(page.getByRole("button", { name: /Tandai semua/ }).or(page.getByText(/Belum ada notifikasi/i)).first()).toBeVisible();

  // 10. Keluar.
  await page.goto("/dashboard");
  await logout(page);
  await expect(page.getByRole("link", { name: /Masuk creator/ })).toBeVisible();

  expect(bugs.findings(), bugs.findings().join("\n")).toEqual([]);
});
