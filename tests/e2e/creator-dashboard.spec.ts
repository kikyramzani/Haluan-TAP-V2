import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Sama seperti auth-operations.spec.ts, supaya Origin header selalu cocok
// dengan server yang sedang diuji dan datastore mock bergerak bersama gate.
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

async function resetStore(context: BrowserContext) {
  await context.request.post(`${storeUrl}/__reset`);
}

test("dashboard creator: overview, header sesi, profil, dan logout terkoneksi", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Dian Kreator", email: "dian@tap.test", phone: "081234560001" });

  // Overview: sapaan, aksi cepat, dan status permintaan sample kosong yang jujur.
  await expect(page.getByRole("heading", { name: /Halo, Dian/ })).toBeVisible();
  await expect(page.getByText("Belum ada request sample.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Cari sample tersedia/ })).toBeVisible();

  // Header publik pada halaman lain harus tahu sesi ini sudah masuk: tidak ada
  // lagi ajakan "Daftar" atau "Gabung sekarang" untuk orang yang sudah masuk.
  //
  // ".nav-session" sengaja disembunyikan lewat CSS di bawah 600px (digantikan
  // "Akun" pada navigasi bawah), jadi diperiksa lewat href-nya, bukan
  // toBeVisible() — supaya berkas ini tetap benar dijalankan di proyek mobile.
  await page.goto("/deals");
  await expect(page.locator(".nav-session")).toHaveAttribute("href", "/dashboard");
  await expect(page.locator(".nav-session")).toContainText("Dian");
  await expect(page.getByRole("link", { name: "Daftar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Gabung sekarang" })).toHaveCount(0);

  // Profil: simpan sebagian data, konfirmasi tersimpan tanpa reload penuh.
  await page.goto("/dashboard#profile");
  await page.getByLabel("Username TikTok").fill("diankreator");
  await page.getByLabel("Niche utama").selectOption("Beauty & Health");
  await page.getByRole("button", { name: /Simpan profil/ }).click();
  await expect(page.getByText("Profil berhasil disimpan.")).toBeVisible();

  // Logout mengembalikan ke home publik, dan dashboard tidak lagi bisa diakses.
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(origin + "/");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/daftar\?mode=login/);

  await context.close();
});

test("dashboard creator: link request sample dari katalog dan halaman deal membawa brand yang sama", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Bela Kreator", email: "bela@tap.test", phone: "081234560002" });

  // Dari halaman deal penuh (brand dengan sample: Mistine di fixture). Header
  // dan footer punya link "Request sample" polos juga, jadi dicocokkan lewat
  // panah "↗" yang hanya dipakai versi berisi brand ini.
  await page.goto("/deal/mistine");
  const dealLink = page.getByRole("link", { name: "Request sample ↗" });
  await expect(dealLink).toHaveAttribute("href", /\/request-sample\?brand=Mistine&platform=TikTok/);

  // Dari modal katalog untuk brand yang sama — sebelumnya link ini polos tanpa
  // parameter, sehingga brand tidak ikut terisi otomatis di halaman tujuan.
  await page.goto("/deals");
  await page.locator(".deal-card").filter({ hasText: "Mistine" }).getByRole("button", { name: /Dapatkan komisi/ }).click();
  const sheetLink = page.getByRole("dialog").getByRole("link", { name: /Request sample/ });
  await expect(sheetLink).toHaveAttribute("href", /\/request-sample\?brand=Mistine&platform=TikTok/);

  await context.close();
});
