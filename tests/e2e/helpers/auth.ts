import { expect, type Page } from "@playwright/test";

const EMAIL_SERVER_URL = `http://127.0.0.1:${process.env.MOCK_EMAIL_PORT ?? 6390}`;

/**
 * AUTH_EMAIL_MODE=local (see playwright.config.ts) makes the app POST every
 * verification/reset code to tests/e2e/helpers/mock-email-server.mjs for
 * real — this reads it back. (AUTH_EMAIL_MODE=test's debugCode-in-response
 * shortcut looked simpler, but is silently inert under `next start`, which
 * always forces NODE_ENV=production — see playwright.config.ts's own comment
 * for the full explanation.)
 */
async function latestCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${EMAIL_SERVER_URL}/__emails?to=${encodeURIComponent(email)}`);
    const { emails } = await response.json();
    if (emails.length) return emails.at(-1).code;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`No verification code arrived for ${email} within the wait window`);
}

export async function register(page: Page, input: { name: string; email: string; phone: string; password?: string }) {
  await page.goto("/daftar");
  await page.getByLabel("Nama lengkap").fill(input.name);
  await page.getByLabel("Nomor WhatsApp").fill(input.phone);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel(/Kata sandi/).fill(input.password ?? "Password2026");
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await expect(page.getByRole("heading", { name: "Cek email kamu." })).toBeVisible();
  const code = await latestCodeFor(input.email);
  await page.getByLabel("Kode enam digit").fill(code);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  // A brand-new account has not finished /daftar/lengkapi yet, so the
  // /dashboard layout's onboarding gate (app/dashboard/layout.tsx) redirects
  // the very first visit there instead of rendering dashboard content —
  // verified against the running app: register + verify, then a real request
  // for /dashboard 307s to /daftar/lengkapi until onboardingCompletedAt is
  // set. Completing onboarding is a deliberate separate step for callers
  // that need an actual dashboard session (drive OnboardingForm's fields, or
  // see helpers/db.ts's completeOnboarding() for a direct-write shortcut).
  await expect(page).toHaveURL(/\/(dashboard|daftar\/lengkapi)/);
}

/** For flows (e.g. password reset) that need the latest code sent to an address without going through register(). */
export async function readLatestCode(email: string): Promise<string> {
  return latestCodeFor(email);
}

export async function login(page: Page, input: { email: string; password?: string }) {
  await page.goto("/daftar?mode=login");
  await page.getByLabel("Email").fill(input.email);
  await page.locator('input[name="password"]').fill(input.password ?? "Password2026");
  await page.getByRole("button", { name: "Masuk creator" }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Keluar" }).click();
}

/** ADMIN_EMAILS in playwright.config.ts's webServer is the allowlist gate — this email is the only one that becomes an admin on registration. */
export const ADMIN_EMAIL = "admin@tap.test";
