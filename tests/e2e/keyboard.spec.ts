import { expect, test } from "@playwright/test";
import { cleanupCatalogFixtures, seedCatalogFixtures } from "./helpers/db";

// Keyboard journeys model a desktop user, so this file is deliberately outside the
// mobile-webkit project's match: the iPhone profile has no Tab key, and a skip that
// fires on every run is a hole the gate would have to be taught to ignore. Both
// Chromium projects hold the contract instead.

// Nothing here reads `fixtures`. The test only needs *some* actionable
// campaign to exist on /deals so "Dapatkan komisi" has a button to press.
// The real catalog (691+ brands) already guarantees that today, but seeding
// one `e2e-`-prefixed campaign keeps the guarantee independent of real
// catalog state, matching the pattern the other rewritten specs use.
test.beforeAll(async () => {
  await seedCatalogFixtures();
});

test.afterAll(async () => {
  await cleanupCatalogFixtures();
});

test("keyboard menjalankan detail campaign: buka, terkunci, tutup, fokus kembali", async ({ page, browserName }) => {
  // A keyboard journey models a desktop user; the iPhone profile has no Tab key,
  // and WebKit's Tab semantics there mirror Safari's, not a keyboard user's. The
  // contract is held by both Chromium projects; skipping here is a statement about
  // the device, not an exemption for the code.
  test.skip(browserName === "webkit", "perangkat sentuh tidak punya tombol Tab");
  // `:focus-within` parity proved the appearance; this proves the operation. A
  // keyboard user has to be able to open the deal, stay inside it, leave it, and
  // land back where they were. Anything less makes the catalogue mouse-only.
  await page.goto("/deals");
  const trigger = page.getByRole("button", { name: /Dapatkan komisi/ }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  // Focus starts on the close control, and tabbing forward stays inside the dialog.
  await expect(page.getByRole("button", { name: "Tutup detail campaign" }).last()).toBeFocused();
  for (let step = 0; step < 24; step += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement));
    expect(inside, `tab ke-${step + 1} keluar dari dialog`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
