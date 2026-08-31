import { expect, test } from "@playwright/test";

/**
 * Tiga penjagaan yang persis akan menangkap bug-bug yang ditemukan audit
 * mobile sebelum perombakan ini:
 *
 * 1. ThemeToggle dulu z-index 60 (di ATAS bar yang 55) dan offset mobile-nya
 *    tidak menyertakan safe-area, jadi di iPhone berponi tombolnya menimpa bar.
 * 2. Sasaran sentuh tab tidak pernah diukur.
 * 3. Konten paling bawah bisa terjebak di balik bar yang melayang.
 *
 * Hanya berjalan di lebar mobile — barnya memang display:none di atas 900px.
 */

test.beforeEach(async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) > 900, "Bar bawah hanya tampil di bawah 900px");
  await page.goto("/deals");
  await expect(page.locator(".mobile-nav")).toBeVisible();
});

test("tombol tema tidak menimpa navigasi bawah", async ({ page }) => {
  const nav = await page.locator(".mobile-nav").boundingBox();
  const toggle = await page.locator(".theme-toggle").boundingBox();
  expect(nav).not.toBeNull();
  expect(toggle).not.toBeNull();
  expect(toggle!.y + toggle!.height).toBeLessThanOrEqual(nav!.y);
});

test("setiap tab memenuhi sasaran sentuh minimum", async ({ page }) => {
  const tabs = await page.locator(".mobile-nav a").all();
  expect(tabs.length).toBeGreaterThanOrEqual(4);
  for (const tab of tabs) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("konten paling bawah tidak terjebak di balik bar", async ({ page }) => {
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  const nav = await page.locator(".mobile-nav").boundingBox();
  const lastLink = await page.locator("footer a").last().boundingBox();
  expect(nav).not.toBeNull();
  expect(lastLink).not.toBeNull();
  expect(lastLink!.y + lastLink!.height).toBeLessThanOrEqual(nav!.y);
});

test("tab aktif ditandai lebih dari sekadar warna", async ({ page }) => {
  const active = page.locator('.mobile-nav a[aria-current="page"]');
  await expect(active).toHaveCount(1);
  // Ikon terisi (bukan garis) adalah penanda kedua di samping pil dan warna,
  // supaya keadaan aktif tetap terbaca tanpa membedakan warna.
  await expect(active.locator("svg")).toHaveCount(1);
  const pill = await active.locator(".mobile-nav-icon").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(pill).not.toBe("rgba(0, 0, 0, 0)");
});
