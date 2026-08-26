import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Baris SKU baru hanya muncul setelah admin menandai brand, jadi
 * `accessibility.spec.ts` yang berjalan tanpa login tidak akan pernah
 * melihatnya. Berkas ini menyiapkan keadaannya lebih dulu supaya bagian
 * beranda itu tetap ikut diperiksa di kedua tema.
 */

const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;
const storeUrl = `http://127.0.0.1:${process.env.MOCK_REDIS_PORT ?? 6381}`;

for (const theme of ["dark", "light"] as const) {
  test(`beranda dengan baris SKU baru bersih di tema ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    await context.request.post(`${storeUrl}/__reset`);
    const page = await context.newPage();

    await page.goto("/daftar");
    await page.getByLabel("Nama lengkap").fill("Axe Admin");
    await page.getByLabel("Nomor WhatsApp").fill("081234567939");
    await page.getByLabel("Email").fill("admin@tap.test");
    await page.getByLabel(/Kata sandi/).fill("Password2026");
    await page.getByLabel(/Saya menyetujui/).check();
    await page.getByRole("button", { name: /Buat akun/ }).click();
    await expect(page.getByRole("heading", { name: "Cek email kamu." })).toBeVisible();
    const outbox = await page.request.get(`${storeUrl}/__emails?to=${encodeURIComponent("admin@tap.test")}`).then((r) => r.json());
    await page.getByLabel("Kode enam digit").fill(outbox.emails.at(-1).code);
    await page.getByRole("button", { name: "Verifikasi email" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    for (const brand of ["glowbetter", "mistine", "cetaphil"]) {
      const saved = await context.request.patch("/api/admin/catalog", {
        headers: { origin }, data: { brandKey: brand, platform: "tiktok", newSku: true },
      });
      expect(saved.ok()).toBeTruthy();
    }

    await page.addInitScript((v) => window.localStorage.setItem("tap-theme", v), theme);
    await page.goto("/");
    await expect(page.locator("#new-sku")).toBeVisible();
    await expect(page.locator(".badge-new-sku").first()).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations
      .filter((v) => v.impact === "critical" || v.impact === "serious")
      .map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.flatMap((n) => n.target) }));
    expect(violations).toEqual([]);
    await context.close();
  });
}
