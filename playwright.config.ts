import { defineConfig, devices } from "@playwright/test";

// Overridable so a gate can move off a port something else already holds. The
// specs read the same variables, so the Origin header they send always matches
// the server they are talking to.
const port = Number(process.env.E2E_PORT ?? 3101);
const legacyPort = Number(process.env.E2E_LEGACY_PORT ?? 3104);
const mockPort = Number(process.env.MOCK_REDIS_PORT ?? 6381);
const mockUrl = `http://127.0.0.1:${mockPort}`;
const baseURL = `http://localhost:${port}`;

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
    { name: "mobile-chromium", testIgnore: /auth-legacy\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "desktop-chromium", testIgnore: /auth-legacy\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "legacy-auth", testMatch: /auth-legacy\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${legacyPort}` } },
    // A second engine on the surfaces creators actually touch. The operator flows
    // stay on Chromium: what differs between engines is rendering and layout,
    // not the datastore lifecycle those specs exercise.
    { name: "mobile-webkit", testMatch: /(public|accessibility)\.spec\.ts/, use: { ...devices["iPhone 14"] } },
  ],
  webServer: [
    {
      command: "node tests/helpers/mock-redis.mjs",
      url: `${mockUrl}/health`,
      env: { MOCK_REDIS_PORT: String(mockPort) },
      // Never borrow a server this run did not start. Reuse cannot tell the
      // difference between the build under test, a stale build from an earlier
      // run, and an unrelated project that happens to hold the port — and a gate
      // that measured any of those is not evidence about this commit.
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
      env: {
        KV_REST_API_URL: mockUrl,
        KV_REST_API_TOKEN: "tap-local-test-token",
        ADMIN_EMAILS: "admin@tap.test",
        CAMPAIGN_CATALOG_CSV_URL: `${mockUrl}/fixtures/tiktok.csv`,
        CAMPAIGN_LINKS_CSV_URL: `${mockUrl}/fixtures/tiktok.csv`,
        SHOPEE_CAMPAIGNS_CSV_URL: `${mockUrl}/fixtures/shopee.csv`,
        GOOGLE_CLIENT_ID: "e2e-client-id",
        GOOGLE_CLIENT_SECRET: "e2e-client-secret",
        CATALOG_QUALITY_LOG: "silent",
        // Local servers must not impersonate a production deployment: the
        // developer email transports are refused when VERCEL_ENV says production.
        VERCEL_ENV: "test",
        AUTH_EMAIL_MODE: "local",
        AUTH_EMAIL_LOCAL_ENDPOINT: `${mockUrl}/__email`,
        CRON_SECRET: "e2e-cron-secret",
      },
    },
    {
      command: `npm run start -- --port ${legacyPort}`,
      url: `http://localhost:${legacyPort}`,
      reuseExistingServer: false,
      env: {
        KV_REST_API_URL: mockUrl,
        KV_REST_API_TOKEN: "tap-local-test-token",
        ADMIN_EMAILS: "admin@tap.test",
        CAMPAIGN_CATALOG_CSV_URL: `${mockUrl}/fixtures/tiktok.csv`,
        CAMPAIGN_LINKS_CSV_URL: `${mockUrl}/fixtures/tiktok.csv`,
        SHOPEE_CAMPAIGNS_CSV_URL: `${mockUrl}/fixtures/shopee.csv`,
        CATALOG_QUALITY_LOG: "silent",
        // Local servers must not impersonate a production deployment: the
        // developer email transports are refused when VERCEL_ENV says production.
        VERCEL_ENV: "test",
        CRON_SECRET: "e2e-cron-secret",
      },
    },
  ],
});
