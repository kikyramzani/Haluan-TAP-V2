import { expect, test } from "@playwright/test";
import { register } from "./helpers/auth";
import {
  cleanupCatalogFixtures,
  cleanupSampleRequests,
  cleanupUsersByEmails,
  completeCreatorProfileAndVerify,
  completeOnboarding,
  readLatestSampleRequestFor,
  resetRateLimitScope,
  seedCatalogFixtures,
  verifyMembershipOnly,
  type CatalogFixtures,
} from "./helpers/db";

/**
 * Request sample memakai alamat dan profil yang SUDAH diisi creator — tidak
 * pernah meminta ulang.
 *
 * Tiga hal yang dijaga:
 *   1. Profil lengkap: form hanya berisi campaign, identitas platform, dan
 *      komitmen; alamat tampil sebagai ringkasan baca-saja. Yang tersimpan di
 *      basis data adalah alamat profil, dengan format teks yang sama seperti
 *      sebelumnya.
 *   2. Profil belum lengkap: tidak ada form sama sekali — halaman menyebut
 *      persis field yang kurang dan mengarahkan ke profil. Dulu creator mengisi
 *      form panjang lalu ditolak gerbang dengan PROFILE_INCOMPLETE.
 *   3. Server adalah satu-satunya sumber: alamat palsu dari body diabaikan.
 */

let phoneCounter = 0;
const uniquePhone = () => `0812${String(Date.now()).slice(-8)}${++phoneCounter}`;
const emailsToClean: string[] = [];
const requestIds: string[] = [];
let fixtures: CatalogFixtures;

test.beforeAll(async () => { fixtures = await seedCatalogFixtures(); });
test.beforeEach(async () => {
  for (const scope of ["register-ip", "verify-confirm-ip", "register-account", "login-account", "login-ip", "sample"]) await resetRateLimitScope(scope);
});
test.afterAll(async () => {
  await cleanupSampleRequests(requestIds);
  await cleanupCatalogFixtures();
  await cleanupUsersByEmails(emailsToClean);
});

test("profil lengkap: alamat tampil sebagai ringkasan, tidak diminta lagi, dan yang tersimpan adalah alamat profil", async ({ page }) => {
  const email = `e2e-sample-profil-${Date.now()}@example.com`;
  emailsToClean.push(email);
  await register(page, { name: "Profil Kreator", email, phone: uniquePhone() });
  await completeOnboarding(email);
  await completeCreatorProfileAndVerify(email);

  await page.goto("/request-sample");
  const summary = page.getByTestId("shipping-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("E2E Creator");
  await expect(summary).toContainText("Jl. E2E Test Nomor 1");
  await expect(summary).toContainText("12345");
  await expect(summary.getByRole("link", { name: /Ubah di profil/ })).toHaveAttribute("href", "/dashboard/profil");

  // Tidak ada satu pun field alamat/penerima/telepon di form.
  for (const name of ["street", "rtRw", "kelurahan", "kecamatan", "kabupaten", "provinsi", "kodePos", "recipientName", "phone"]) {
    await expect(page.locator(`form [name="${name}"]`), `field ${name} tidak boleh ada`).toHaveCount(0);
  }

  const form = page.locator("form");
  await form.locator('input[name="campaign"]').fill(`${fixtures.single.displayName} · TikTok`);
  await form.locator('input[name="username"]').fill("profilkreator");
  await form.locator('input[name="profile"]').fill("https://www.tiktok.com/@profilkreator");
  await form.locator('input[name="commitment"]').check();
  await form.getByRole("button", { name: /Kirim request/ }).click();
  await expect(page.locator(".success-state")).toBeVisible();

  const saved = await readLatestSampleRequestFor(email);
  expect(saved).not.toBeNull();
  requestIds.push(saved!.id);
  expect(saved!.recipientName).toBe("E2E Creator");
  expect(saved!.recipientPhone).toBe("628123456789");
  expect(saved!.legacyAddressText).toContain("Jl. E2E Test Nomor 1");
  expect(saved!.legacyAddressText).toContain("12345");
  expect(saved!.username).toBe("profilkreator");
});

test("profil belum lengkap: tidak ada form, halaman menyebut yang kurang dan mengarahkan ke profil", async ({ page }) => {
  const email = `e2e-sample-kurang-${Date.now()}@example.com`;
  emailsToClean.push(email);
  await register(page, { name: "Kurang Kreator", email, phone: uniquePhone() });
  await completeOnboarding(email);
  await verifyMembershipOnly(email);

  await page.goto("/request-sample");
  await expect(page.getByRole("heading", { name: "Alamat pengiriman belum lengkap." })).toBeVisible();
  await expect(page.getByText(/Masih perlu:.*Provinsi/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Lengkapi di profil/ })).toHaveAttribute("href", "/dashboard/profil");
  await expect(page.locator("form")).toHaveCount(0);
});

test("server mengabaikan alamat dari body dan memakai alamat profil", async ({ page }) => {
  const email = `e2e-sample-server-${Date.now()}@example.com`;
  emailsToClean.push(email);
  await register(page, { name: "Server Kreator", email, phone: uniquePhone() });
  await completeOnboarding(email);
  await completeCreatorProfileAndVerify(email);
  await page.goto("/request-sample");

  const response = await page.request.post("/api/sample-requests", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      brand: fixtures.single.displayName,
      platform: "TikTok",
      username: "serverkreator",
      profileUrl: "https://www.tiktok.com/@serverkreator",
      recipientName: "PENERIMA PALSU",
      phone: "0899999999",
      address: "ALAMAT PALSU DARI KLIEN NOMOR 999",
      commitment: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);

  const saved = await readLatestSampleRequestFor(email);
  requestIds.push(saved!.id);
  expect(saved!.legacyAddressText).not.toContain("PALSU");
  expect(saved!.legacyAddressText).toContain("Jl. E2E Test Nomor 1");
  expect(saved!.recipientName).toBe("E2E Creator");
  expect(saved!.recipientPhone).toBe("628123456789");
});
