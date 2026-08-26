import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * `accessibility.spec.ts` hanya memeriksa rute publik yang bisa dibuka tanpa
 * login. Dashboard creator dan workspace admin butuh sesi lebih dulu, jadi
 * keduanya diperiksa di sini, di kedua tema.
 */

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

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.flatMap((n) => n.target) }));
}

const ADMIN_VIEWS = [/Overview/, /Database Kreator/, /Katalog Campaign/, /Request Sample/, /Audit Log/, /Product Intel/];

for (const theme of ["dark", "light"] as const) {
  test(`dashboard creator bersih di tema ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    await context.request.post(`${storeUrl}/__reset`);
    const page = await context.newPage();
    await page.addInitScript((v) => window.localStorage.setItem("tap-theme", v), theme);
    await register(page, { name: "Axe Creator", email: "axe-creator@tap.test", phone: "081234561101" });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await context.close();
  });

  test(`workspace admin bersih di keenam tampilan, tema ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    await context.request.post(`${storeUrl}/__reset`);
    const page = await context.newPage();
    await page.addInitScript((v) => window.localStorage.setItem("tap-theme", v), theme);
    await register(page, { name: "Axe Admin", email: "admin@tap.test", phone: "081234561102" });
    await page.goto("/admin");

    for (const view of ADMIN_VIEWS) {
      await page.getByRole("button", { name: view }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const found = await violations(page);
      expect(found, `pelanggaran pada tampilan ${view}`).toEqual([]);
    }
    await context.close();
  });
}
