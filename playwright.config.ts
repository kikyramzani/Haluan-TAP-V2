import { defineConfig, devices } from "@playwright/test";

// Next.js's own .env.local auto-load is SKIPPED when NODE_ENV=test (a
// deliberate Next.js behavior, not a bug) — and Playwright's webServer child
// process ends up with exactly that NODE_ENV. Without this, `next start`
// boots with no POSTGRES_PRISMA_URL at all and crashes immediately. Loaded
// here (this config file's own process), then forwarded explicitly below.
try { process.loadEnvFile(".env.local"); } catch { /* absent locally is fine; CI supplies real env vars directly */ }

// Overridable so a gate can move off a port something else already holds. The
// specs read the same variable, so the Origin header they send always matches
// the server they are talking to.
const port = Number(process.env.E2E_PORT ?? 3101);
const baseURL = `http://localhost:${port}`;
const emailPort = Number(process.env.MOCK_EMAIL_PORT ?? 6390);
const emailServerUrl = `http://127.0.0.1:${emailPort}`;

/**
 * Phase 9 of the rebuild plan replaced the whole harness this file used to
 * spin up: a mock Redis/KV server plus CSV fixture host. That combination no
 * longer matches how the app works at all — the datastore is Postgres now,
 * every route reads real Brand/Campaign rows, not a live Sheets export. The
 * app itself is run here against the SAME real dev Postgres every other part
 * of this project uses (see .env.local) — not a separate test database and
 * not fixtures. Specs must never create, mutate, or delete Brand/Campaign/
 * CampaignTier/CampaignLink rows; they may only read the real migrated
 * catalog and must create-and-clean-up their own throwaway User/Creator/
 * Session/SampleRequest/etc. rows (see tests/e2e/helpers/db.ts).
 *
 * Verification codes DO still need a mock email endpoint, despite
 * AUTH_EMAIL_MODE=test's debugCode-in-response mechanism looking like it
 * should make one unnecessary: emailTestModeEnabled() (lib/email-mode.ts)
 * requires NODE_ENV !== "production", and `next start` (run below, the same
 * as a real deployment) unconditionally forces NODE_ENV="production" — so
 * that mode is silently inert under this harness. AUTH_EMAIL_MODE=local has
 * no such restriction (only VERCEL_ENV, already set to "test" below), so
 * this runs a tiny standalone capture server (tests/e2e/helpers/mock-email-server.mjs)
 * as a second webServer instead, and the app POSTs codes to it for real.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // No retries anywhere. A required release gate that goes green on the second
  // attempt is reporting "eventually passed", which is not the question it is
  // there to answer.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    // A second engine on the surfaces creators actually touch. The operator flows
    // stay on Chromium: what differs between engines is rendering and layout,
    // not the datastore lifecycle those specs exercise.
    { name: "mobile-webkit", testMatch: /(public|accessibility)\.spec\.ts/, use: { ...devices["iPhone 14"] } },
  ],
  webServer: [
    {
      command: `node tests/e2e/helpers/mock-email-server.mjs`,
      url: `${emailServerUrl}/health`,
      env: { MOCK_EMAIL_PORT: String(emailPort) },
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- --port ${port}`,
      url: baseURL,
      // Never borrow a server this run did not start. Reuse cannot tell the
      // difference between the build under test, a stale build from an earlier
      // run, and an unrelated project that happens to hold the port — and a gate
      // that measured any of those is not evidence about this commit.
      reuseExistingServer: false,
      env: {
        // Carries POSTGRES_PRISMA_URL/POSTGRES_URL_NON_POOLING/etc. through from
        // .env.local (see the loadEnvFile call above) — without this the server
        // has a real datastore connection string in every other context in this
        // project except here.
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        ADMIN_EMAILS: "admin@tap.test",
        GOOGLE_CLIENT_ID: "e2e-client-id",
        GOOGLE_CLIENT_SECRET: "e2e-client-secret",
        // Local/test servers must not impersonate a production deployment: the
        // developer email transport is refused when VERCEL_ENV says production.
        VERCEL_ENV: "test",
        AUTH_EMAIL_MODE: "local",
        AUTH_EMAIL_LOCAL_ENDPOINT: `${emailServerUrl}/__email`,
        CRON_SECRET: "e2e-cron-secret",
        // Katalog TIDAK boleh di-cache di bawah harness ini. catalog-badges.spec.ts
        // menyemai satu campaign lalu langsung menuntutnya terlihat di /deals;
        // cache lima menit akan menyajikan versi sebelum semaian dan tesnya gagal
        // karena alasan yang tidak ada hubungannya dengan produk.
        CATALOG_CACHE_TTL: "0",
      },
    },
  ],
});
