import { expect, test, type Page } from "@playwright/test";

const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;
const storeUrl = `http://127.0.0.1:${process.env.MOCK_REDIS_PORT ?? 6381}`;

async function register(page: Page, input: { name: string; email: string; phone: string }) {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill(input.name);
  await page.getByLabel("Nomor WhatsApp").fill(input.phone);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel(/Kata sandi/).fill("Password2026");
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await expect(page.getByRole("heading", { name: "Cek email kamu." })).toBeVisible();
  const outbox = await page.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(input.email)}`).then((r) => r.json());
  await page.getByLabel("Kode enam digit").fill(outbox.emails.at(-1).code);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("admin: sidebar dashboard menuju /admin, dan admin bisa kembali serta logout", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await context.request.post(`${storeUrl}/__reset`);
  const page = await context.newPage();
  await register(page, { name: "Admin Sesi", email: "admin@tap.test", phone: "081234561001" });

  // Dashboard creator -> admin, satu-satunya pintu masuk yang tersedia.
  await expect(page.getByRole("link", { name: /Admin/ })).toBeVisible();
  await page.getByRole("link", { name: /Admin/ }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Overview KPI Afiliasi" })).toBeVisible();

  // Sebelumnya tidak ada jalan balik selain mengetik ulang alamat atau tombol
  // back browser — sekarang ada link eksplisit di header admin.
  await page.getByRole("link", { name: /Dashboard creator/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Logout dari dalam admin: sebelumnya tidak ada tombolnya sama sekali.
  await page.goto("/admin");
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/daftar/);

  await context.close();
});

test("admin: keenam tampilan sidebar saling terhubung dan merender judulnya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await context.request.post(`${storeUrl}/__reset`);
  const page = await context.newPage();
  await register(page, { name: "Admin Nav", email: "admin@tap.test", phone: "081234561002" });
  await page.goto("/admin");

  const views: Array<[RegExp, string]> = [
    [/Database Kreator/, "Database Kreator"],
    [/Katalog Campaign/, "Katalog Campaign"],
    [/Request Sample/, "Request Sample"],
    [/Audit Log/, "Audit Operasional"],
    [/Product Intel/, "Product Intelligence"],
    [/Overview/, "Overview KPI Afiliasi"],
  ];
  for (const [button, heading] of views) {
    await page.getByRole("button", { name: button }).click();
    // Setiap tampilan punya h2 panel sendiri (mis. "0 request sample") yang
    // bisa memuat kata yang sama, jadi judul view dicocokkan lewat h1 header.
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  // Data operasional sempat dimuat sekali di awal; pada akhirnya tidak boleh
  // tersangkut di keadaan "Memuat…" selamanya.
  await expect(page.getByText("Memuat data operasional…")).toHaveCount(0);

  await context.close();
});

test("admin: katalog campaign memberi pesan saat pencarian tidak menemukan brand", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await context.request.post(`${storeUrl}/__reset`);
  const page = await context.newPage();
  await register(page, { name: "Admin Katalog", email: "admin@tap.test", phone: "081234561003" });
  await page.goto("/admin");
  await page.getByRole("button", { name: /Katalog Campaign/ }).click();

  await page.getByLabel("Cari brand").fill("brand-yang-benar-benar-tidak-ada-di-sheet");
  await expect(page.getByText("Tidak ada brand yang cocok dengan pencarian atau filter ini.")).toBeVisible();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(0);

  await context.close();
});

test("creator biasa tidak bisa membuka /admin, diarahkan ke dashboard dengan pesan", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await context.request.post(`${storeUrl}/__reset`);
  const page = await context.newPage();
  await register(page, { name: "Creator Biasa", email: "biasa@tap.test", phone: "081234561004" });

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  await expect(page.getByText("Akses admin tidak tersedia.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Admin/ })).toHaveCount(0);

  await context.close();
});
