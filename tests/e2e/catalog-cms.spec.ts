import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;
const storeUrl = `http://127.0.0.1:${process.env.MOCK_REDIS_PORT ?? 6381}`;

async function resetStore(context: BrowserContext) {
  const response = await context.request.post(`${storeUrl}/__reset`);
  expect(response.status()).toBe(204);
}

/** Registrasi memakai jalur kode email yang sama dengan creator biasa. */
async function register(page: Page, input: { name: string; email: string; phone: string }) {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill(input.name);
  await page.getByLabel("Nomor WhatsApp").fill(input.phone);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel(/Kata sandi/).fill("Password2026");
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await expect(page.getByRole("heading", { name: "Cek email kamu." })).toBeVisible();
  const outbox = await page.request
    .get(`${storeUrl}/__emails?to=${encodeURIComponent(input.email)}`)
    .then((response) => response.json());
  await page.getByLabel("Kode enam digit").fill(outbox.emails.at(-1).code);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("CMS katalog menimpa sheet, tercatat di audit, dan bisa dikembalikan", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "Admin CMS", email: "admin@tap.test", phone: "081234567893" });

  // Nilai awal berasal dari spreadsheet.
  const before = await context.request.get("/api/campaigns").then((response) => response.json());
  const glow = before.campaigns.find((item: { id: string }) => item.id === "glow-better");
  expect(glow.commission).toBe(12);

  await admin.goto("/admin");
  await admin.getByRole("button", { name: /Katalog Campaign/ }).click();
  const row = admin.getByRole("row").filter({ hasText: "Glow Better" });
  await expect(row).toContainText("Dari sheet");
  await row.getByRole("button", { name: "Edit" }).click();

  const editor = admin.getByRole("dialog", { name: /Edit Glow Better/ });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nama tampil").fill("Glow Better ID");
  await editor.getByLabel("Komisi campaign 1").fill("4");
  await editor.getByLabel("Sample support").selectOption("true");
  await editor.getByRole("button", { name: "Simpan perubahan" }).click();

  // Override menang atas sheet di katalog publik, tanpa menyentuh sheet.
  await expect(admin.getByRole("row").filter({ hasText: "Glow Better ID" })).toContainText("Diedit manual");
  const after = await context.request.get("/api/campaigns").then((response) => response.json());
  const edited = after.campaigns.find((item: { brand: string }) => item.brand === "Glow Better ID");
  expect(edited.commission).toBe(4);
  expect(edited.hasSample).toBe(true);

  // Perubahan katalog adalah mutasi admin, jadi harus meninggalkan jejak audit.
  const audits = await context.request.get("/api/admin/audits").then((response) => response.json());
  expect(audits.events.some((event: { action: string }) => event.action === "catalog.override.save")).toBeTruthy();

  // Sinkronisasi ulang sheet tidak boleh menghapus suntingan admin.
  const resynced = await context.request.get("/api/campaigns").then((response) => response.json());
  expect(resynced.campaigns.find((item: { brand: string }) => item.brand === "Glow Better ID").commission).toBe(4);

  // Reset mengembalikan brand ke nilai spreadsheet apa adanya.
  admin.once("dialog", (dialog) => void dialog.accept());
  await admin.getByRole("row").filter({ hasText: "Glow Better ID" }).getByRole("button", { name: "Reset" }).click();
  await expect(admin.getByRole("row").filter({ hasText: "Glow Better" })).toContainText("Dari sheet");
  const reverted = await context.request.get("/api/campaigns").then((response) => response.json());
  expect(reverted.campaigns.find((item: { id: string }) => item.id === "glow-better").commission).toBe(12);

  await context.close();
});

test("CMS menyembunyikan brand dari katalog publik tanpa menghapus datanya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "Admin CMS", email: "admin@tap.test", phone: "081234567894" });

  await admin.goto("/admin");
  await admin.getByRole("button", { name: /Katalog Campaign/ }).click();
  await admin.getByRole("row").filter({ hasText: "Cetaphil" }).getByRole("button", { name: "Edit" }).click();
  const editor = admin.getByRole("dialog", { name: /Edit Cetaphil/ });
  await editor.getByLabel("Sembunyikan brand ini dari katalog publik").check();
  await editor.getByRole("button", { name: "Simpan perubahan" }).click();
  // Menunggu tabel memastikan penyimpanan selesai sebelum katalog publik dibaca.
  await expect(admin.getByRole("row").filter({ hasText: "Cetaphil" })).toContainText("Disembunyikan");

  const catalog = await context.request.get("/api/campaigns").then((response) => response.json());
  expect(catalog.campaigns.some((item: { brand: string }) => item.brand === "Cetaphil")).toBeFalsy();

  // Disembunyikan berarti tidak tayang, bukan terhapus: override-nya masih ada
  // dan bisa dibatalkan kapan saja.
  const workspace = await context.request.get("/api/admin/catalog").then((response) => response.json());
  const hiddenRow = workspace.rows.find((row: { key: string }) => row.key === "cetaphil");
  expect(hiddenRow.override.hidden).toBe(true);
  expect(hiddenRow.sheet.commission).toBe(24);

  await context.close();
});

test("CMS menolak TAP link yang bukan HTTPS", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "Admin CMS", email: "admin@tap.test", phone: "081234567895" });

  // Link partner hanya boleh HTTPS. Nilai lain diabaikan di server, bukan
  // disimpan lalu dirender jadi tautan yang tidak aman.
  const response = await context.request.patch("/api/admin/catalog", {
    headers: { origin },
    data: {
      brandKey: "glowbetter",
      manualTiers: [{ label: "Campaign nakal", commission: 10, tapLink: "javascript:alert(1)", hasSample: false }],
    },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).override.manualTiers).toBeUndefined();

  await context.close();
});

test("CMS hanya bisa diakses administrator", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const anonymous = await context.request.get("/api/admin/catalog");
  expect(anonymous.status()).toBe(403);

  const write = await context.request.patch("/api/admin/catalog", {
    headers: { origin },
    data: { brandKey: "glowbetter", displayName: "Dibajak" },
  });
  expect(write.status()).toBe(403);
  await context.close();
});
