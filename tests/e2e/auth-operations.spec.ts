import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { hashPassword } from "../../lib/password";

// Same source of truth as playwright.config.ts, so the Origin header always
// matches the server actually under test.
const origin = `http://localhost:${process.env.E2E_PORT ?? 3101}`;
// The mock datastore moves with the gate, so a run can be placed on free ports
// end to end.
// Named for what it is, so a local helper called `store` cannot shadow it —
// which it did, turning the constant into a reference to itself.
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
  const registrationOutbox = await page.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(input.email)}`).then((response) => response.json());
  await page.getByLabel("Kode enam digit").fill(registrationOutbox.emails.at(-1).code);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function resetStore(context: BrowserContext) {
  const response = await context.request.post(`${storeUrl}/__reset`);
  expect(response.status()).toBe(204);
}

async function redis(context: BrowserContext, command: Array<string | number>) {
  const response = await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: command,
  });
  expect(response.ok()).toBeTruthy();
}

async function readStore(context: BrowserContext, command: Array<string | number>) {
  const response = await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: command,
  });
  return (await response.json()).result;
}

async function sessionCount(context: BrowserContext, userId: string) {
  return readStore(context, ["ZCARD", `tap:v1:user:${userId}:sessions`]);
}

/** A fault that never fired would let one of these tests pass for no reason. */
async function faultsFired(context: BrowserContext) {
  const response = await context.request.get(`${storeUrl}/__faults`);
  return (await response.json()).fired;
}

async function arm(context: BrowserContext, rule: Record<string, unknown>) {
  await context.request.post(`${storeUrl}/__fail`, { data: rule });
}

async function disarm(context: BrowserContext) {
  await context.request.post(`${storeUrl}/__fail`, { data: { reset: true } });
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Plants the state that exists when a registration claim expires between asking
 * for a code and confirming it: the code is still live, but the address or the
 * number now belongs to another account.
 */
async function plantChallenge(context: BrowserContext, input: { challengeId: string; code: string; userId: string; email: string; purpose: "verify" | "reset" }) {
  const codeHash = digest(`${input.challengeId}:${input.code}`);
  await redis(context, ["SET", `tap:v1:email-challenge:${digest(input.challengeId)}`, JSON.stringify({ userId: input.userId, email: input.email, purpose: input.purpose, codeHash, createdAt: "2026-01-01T00:00:00.000Z" })]);
  await redis(context, ["SET", `tap:v1:email-challenge:${digest(input.challengeId)}:guard`, codeHash]);
}

test("creator membership, attributed deal, sample, and admin lifecycle", async ({ browser }) => {
  const creatorContext = await browser.newContext({ baseURL: origin });
  await resetStore(creatorContext);
  const creator = await creatorContext.newPage();
  await register(creator, { name: "Creator QA", email: "creator@tap.test", phone: "081234567891" });
  await expect(creator.getByText("Menunggu verifikasi MCN", { exact: true }).first()).toBeVisible();
  const health = await creatorContext.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe("ready");

  const duplicate = await creatorContext.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Duplicate", email: "creator@tap.test", phone: "081234567899", password: "Password2026", consent: true },
  });
  expect(duplicate.status()).toBe(409);
  const forgedOrigin = await creatorContext.request.patch("/api/profile", {
    headers: { origin: "https://evil.example" },
    data: { name: "Compromised" },
  });
  expect(forgedOrigin.status()).toBe(403);

  const catalog = await creatorContext.request.get("/api/campaigns");
  const campaignPayload = await catalog.json();
  const sampleCampaign = campaignPayload.campaigns.find((item: { hasSample: boolean }) => item.hasSample);
  expect(sampleCampaign, "Master TAP harus memiliki minimal satu campaign sample aktif").toBeTruthy();

  await creator.goto(`/deal/${sampleCampaign.id}`);
  await expect(creator).toHaveURL(new RegExp(`/deal/${sampleCampaign.id}`));
  await expect(creator.getByText("Link ini dapat diakses tanpa login.")).toBeVisible();

  const blocked = await creatorContext.request.post("/api/sample-requests", {
    headers: { origin },
    data: { brand: sampleCampaign.brand, platform: "TikTok", username: "creatorqa", profileUrl: "https://www.tiktok.com/@creatorqa", recipientName: "Creator QA", phone: "081234567891", address: "Jl. Production QA Nomor 10 Jakarta", commitment: true },
  });
  expect(blocked.status()).toBe(403);

  const adminContext = await browser.newContext({ baseURL: origin });
  const admin = await adminContext.newPage();
  await register(admin, { name: "Admin QA", email: "admin@tap.test", phone: "081234567892" });
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Overview KPI Afiliasi" })).toBeVisible();
  await expect(admin.getByText(/sel pada .* brand bermasalah/)).toBeVisible();
  await admin.getByRole("button", { name: /Database Kreator/ }).click();
  const creatorRow = admin.getByRole("row").filter({ hasText: "creator@tap.test" });
  await expect(creatorRow.getByText("Kode", { exact: true })).toBeVisible();
  await creatorRow.getByRole("button", { name: "Verify" }).click();
  await expect(creatorRow.getByText("verified")).toBeVisible();
  await admin.getByRole("button", { name: /Audit Log/ }).click();
  await expect(admin.getByText("membership.update", { exact: true })).toBeVisible();
  await expect(admin.getByRole("cell", { name: /"pending"/ })).toBeVisible();

  await creator.goto("/dashboard");
  await expect(creator.getByText("MCN terverifikasi", { exact: true }).first()).toBeVisible();

  const adminUsers = await adminContext.request.get("/api/admin/users");
  const creatorRecord = (await adminUsers.json()).users.find((user: { email: string }) => user.email === "creator@tap.test");
  expect(creatorRecord.verificationSource).toBe("code");
  const batchBrands = campaignPayload.campaigns.filter((item: { hasSample: boolean }) => item.hasSample).slice(0, 2).map((item: { brand: string }) => item.brand);
  expect(batchBrands).toHaveLength(2);
  const batchRequest = await adminContext.request.post("/api/admin/sample-requests", {
    headers: { origin },
    data: { userId: creatorRecord.id, brands: batchBrands, platform: "TikTok", username: "creatorqa", recipientName: "Creator QA", phone: "081234567891", address: "Jl. Production QA Nomor 10 Jakarta", sow: "VT", picName: "Admin QA" },
  });
  expect(batchRequest.status()).toBe(201);
  const batchPayload = await batchRequest.json();
  expect(batchPayload.requests).toHaveLength(2);
  expect(batchPayload.requests[0].requestGroupId).toBe(batchPayload.requests[1].requestGroupId);

  const shopeeCatalogResponse = await creatorContext.request.get("/api/campaigns?platform=shopee");
  const shopeeCatalog = await shopeeCatalogResponse.json();
  const singleShopeeCampaign = shopeeCatalog.campaigns.find((item: { campaignCount: number }) => item.campaignCount === 1);
  expect(singleShopeeCampaign, "Feed Shopee harus memiliki campaign dengan satu link").toBeTruthy();
  const resumeContext = await browser.newContext({ baseURL: origin });
  const publicShopee = await resumeContext.request.get(`/go/${singleShopeeCampaign.id}`, { maxRedirects: 0 });
  expect(publicShopee.status()).toBe(302);
  expect(publicShopee.headers().location).toMatch(/^https:\/\/(affiliate\.shopee\.co\.id|s\.shopee\.co\.id|shopee\.co\.id|shope\.ee)\//);

  await creator.goto(`/request-sample?brand=${encodeURIComponent(sampleCampaign.brand)}`);
  await expect(creator.getByLabel("Cari campaign dengan sample tersedia")).toHaveValue(`${sampleCampaign.brand} · TikTok`);
  await creator.getByLabel("Cari campaign dengan sample tersedia").fill("Skintific");
  await creator.getByLabel("Username creator").fill("creatorqa");
  await creator.getByLabel("Link profil creator").fill("https://www.tiktok.com/@creatorqa");
  await creator.getByLabel(/Alamat lengkap/).fill("Jl. Production QA Nomor 10");
  await creator.getByLabel("RT / RW").fill("001/002");
  await creator.getByLabel("Kelurahan / Desa").fill("Menteng");
  await creator.getByLabel("Kecamatan").fill("Menteng");
  await creator.getByLabel("Kabupaten / Kota").fill("Jakarta Pusat");
  await creator.getByLabel("Provinsi").fill("DKI Jakarta");
  await creator.getByLabel("Kode pos").fill("10310");
  await creator.getByLabel(/Saya bersedia/).check();
  await creator.getByRole("button", { name: /Kirim request/ }).click();
  await expect(creator.getByText("Pilih campaign yang tersedia dari daftar hasil pencarian.")).toBeVisible();
  await creator.getByLabel("Cari campaign dengan sample tersedia").fill(`${sampleCampaign.brand} · TikTok`);
  await expect(creator.getByLabel("Nama penerima")).toHaveValue("Creator QA");
  await expect(creator.getByLabel("Nomor WhatsApp")).toHaveValue("6281234567891");
  const dealResponse = await creatorContext.request.get(`/deal/${sampleCampaign.id}`, { maxRedirects: 0 });
  expect(dealResponse.status()).toBe(200);
  expect(await dealResponse.text()).toMatch(/Salin link|Lihat etalase/);
  const redirectResponse = await creatorContext.request.get(`/go/${sampleCampaign.id}`, { maxRedirects: 0 });
  expect(redirectResponse.status()).toBe(302);
  expect(redirectResponse.headers().location).toMatch(/^https:\/\//);

  await admin.reload();
  await expect(admin.getByText("ATTRIBUTED OPENS")).toBeVisible();
  await expect(admin.locator(".admin-stats article").filter({ hasText: "ATTRIBUTED OPENS" }).getByText("2", { exact: true })).toBeVisible();

  const sample = await creatorContext.request.post("/api/sample-requests", {
    headers: { origin },
    data: { brand: sampleCampaign.brand, platform: "TikTok", username: "creatorqa", profileUrl: "https://www.tiktok.com/@creatorqa", recipientName: "Creator QA", phone: "081234567891", address: "Jl. Production QA Nomor 10 Jakarta", commitment: true },
  });
  expect(sample.status()).toBe(201);
  const requestBody = await sample.json();
  expect(requestBody.request.id).toMatch(/^TAP-\d{8}-[A-F0-9]{6}$/);

  await admin.reload();
  await admin.getByRole("button", { name: /Request Sample/ }).click();
  const sampleRow = admin.locator(".request-editor").filter({ hasText: requestBody.request.id });
  await expect(sampleRow).toBeVisible();
  for (const status of ["review", "approved", "shipped", "received", "content_submitted"]) {
    await sampleRow.getByRole("combobox").selectOption(status);
    await expect(sampleRow.getByRole("combobox")).toHaveValue(status);
  }

  const invalidTransition = await adminContext.request.patch("/api/admin/sample-requests", {
    headers: { origin },
    data: { id: requestBody.request.id, status: "approved" },
  });
  expect(invalidTransition.status()).toBe(409);

  const anonymousContext = await browser.newContext({ baseURL: origin });
  const anonymousDeal = await anonymousContext.request.get(`/deal/${sampleCampaign.id}`, { maxRedirects: 0 });
  expect(anonymousDeal.status()).toBe(200);
  const anonymousAdmin = await anonymousContext.request.get("/api/admin/users");
  expect(anonymousAdmin.status()).toBe(403);

  const now = new Date().toISOString();
  await Promise.all(Array.from({ length: 55 }, async (_, index) => {
    const id = `pii-user-${index}`;
    const sampleId = `TAP-PAGE-${index}`;
    await Promise.all([
      redis(adminContext, ["SET", `tap:v1:user:${id}`, JSON.stringify({ id, name: `PII Creator ${index}`, email: `pii-${index}@tap.test`, phone: `62812000${index}`, provider: "credentials", role: "creator", membership: "pending", emailVerifiedAt: now, createdAt: now, updatedAt: now })]),
      redis(adminContext, ["ZADD", "tap:v1:users", Date.now() + index, id]),
      redis(adminContext, ["SET", `tap:v1:sample:${sampleId}`, JSON.stringify({ id: sampleId, userId: id, brand: `Brand ${index}`, platform: "TikTok", username: `pii-${index}`, profileUrl: `https://www.tiktok.com/@pii-${index}`, recipientName: `PII Creator ${index}`, phone: `62812000${index}`, address: `Alamat khusus creator nomor ${index}`, commitment: true, status: "submitted", createdAt: now, updatedAt: now })]),
      redis(adminContext, ["ZADD", "tap:v1:samples", Date.now() + index, sampleId]),
    ]);
  }));
  const pagedUsers = await adminContext.request.get("/api/admin/users?limit=500");
  const pagedUserPayload = await pagedUsers.json();
  expect(pagedUserPayload.users).toHaveLength(50);
  expect(pagedUserPayload.pagination.total).toBeGreaterThan(50);
  const searchedUsers = await adminContext.request.get("/api/admin/users?q=pii-54%40tap.test");
  expect((await searchedUsers.json()).users).toHaveLength(1);
  const pagedSamples = await adminContext.request.get("/api/admin/sample-requests?limit=500");
  const pagedSamplePayload = await pagedSamples.json();
  expect(pagedSamplePayload.requests).toHaveLength(50);
  expect(pagedSamplePayload.pagination.total).toBeGreaterThan(50);

  await anonymousContext.close();
  await resumeContext.close();
  await adminContext.close();
  await creatorContext.close();
});

test("creator dapat mereset kata sandi dengan kode sekali pakai", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Reset QA", email: "reset@tap.test", phone: "081234567893" });
  await page.goto("/daftar?mode=login");
  await page.getByRole("button", { name: "Lupa kata sandi?" }).click();
  await page.getByLabel("Email").fill("reset@tap.test");
  await page.getByRole("button", { name: "Kirim kode reset" }).click();
  await expect(page.getByRole("heading", { name: "Buat kata sandi baru." })).toBeVisible();
  const resetOutbox = await context.request.get(`${storeUrl}/__emails?to=reset%40tap.test`).then((response) => response.json());
  await page.getByLabel("Kode enam digit").fill(resetOutbox.emails.at(-1).code);
  await page.getByLabel("Kata sandi baru").fill("PasswordBaru2026");
  await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await context.close();
});

test("akun lama diarahkan ke verifikasi saat provider email aktif", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const id = "legacy-needs-verification";
  const email = "verify-legacy@tap.test";
  const now = "2026-01-01T00:00:00.000Z";
  const user = { id, name: "Legacy Verify", email, phone: "628123456711", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", createdAt: now, updatedAt: now };
  await redis(context, ["SET", `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(context, ["SET", `tap:v1:email:${email}`, id]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), id]);
  const page = await context.newPage();
  await page.goto("/daftar?mode=login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("Password2026");
  await page.getByRole("button", { name: "Masuk creator" }).click();
  await expect(page.getByRole("heading", { name: "Cek email kamu." })).toBeVisible();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
  await page.getByLabel("Kode enam digit").fill(outbox.emails.at(-1).code);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await context.close();
});

test("registrasi dibatalkan bersih ketika pengiriman email gagal", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  await context.request.post(`${storeUrl}/__email-down`);
  const email = "mail-failure@tap.test";
  const response = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Mail Failure", email, phone: "081234567722", password: "Password2026", consent: true },
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).error).toContain("Email verifikasi belum dapat dikirim");
  const claim = await context.request.post(`${storeUrl}`, { headers: { authorization: "Bearer tap-local-test-token" }, data: ["GET", `tap:v1:email:${email}`] });
  expect((await claim.json()).result).toBeNull();
  await context.request.post(`${storeUrl}/__email-up`);
  await context.close();
});

test("cron hanya membersihkan akun pending yang sudah kedaluwarsa", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const id = "expired-pending";
  const email = "expired-pending@tap.test";
  const old = "2026-01-01T00:00:00.000Z";
  const user = { id, name: "Expired Pending", email, phone: "628123456733", provider: "credentials", role: "creator", membership: "pending", emailVerificationStartedAt: old, createdAt: old, updatedAt: old };
  await redis(context, ["SET", `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(context, ["SET", `tap:v1:email:${email}`, id]);
  await redis(context, ["SET", "tap:v1:phone:628123456733", id]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), id]);
  await redis(context, ["ZADD", "tap:v1:users:pending", Date.parse(old), id]);
  const denied = await context.request.get("/api/cron/cleanup-users");
  expect(denied.status()).toBe(401);
  const cleanup = await context.request.get("/api/cron/cleanup-users", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(cleanup.status()).toBe(200);
  expect((await cleanup.json()).removed).toBe(1);
  const auditor = await browser.newContext({ baseURL: origin });
  await register(await auditor.newPage(), { name: "Admin Audit", email: "admin@tap.test", phone: "081234567744" });
  const auditTrail = await auditor.request.get("/api/admin/audits").then((response) => response.json());
  const cleanupEvent = auditTrail.events.find((event: { action: string }) => event.action === "users.cleanup");
  expect(cleanupEvent?.actorId).toBe("system:cron");
  expect(cleanupEvent?.after?.removed).toBe(1);
  await auditor.close();
  const claim = await context.request.post(`${storeUrl}`, { headers: { authorization: "Bearer tap-local-test-token" }, data: ["GET", `tap:v1:email:${email}`] });
  expect((await claim.json()).result).toBeNull();
  await context.close();
});

test("akses admin dicabut begitu email keluar dari allowlist", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const id = "former-admin";
  const email = "former-admin@tap.test";
  const now = "2026-01-01T00:00:00.000Z";
  // Stored role says admin, the allowlist no longer does: exactly the state left
  // behind when an operator is removed from ADMIN_EMAILS.
  const user = { id, name: "Former Admin", email, phone: "628123456755", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "admin", membership: "verified", emailVerifiedAt: now, verificationSource: "code", createdAt: now, updatedAt: now };
  await redis(context, ["SET", `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(context, ["SET", `tap:v1:email:${email}`, id]);
  await redis(context, ["SET", "tap:v1:phone:628123456755", id]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), id]);

  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "Password2026" } });
  expect(signIn.status()).toBe(200);
  const beforeRevocation = await context.request.get("/api/auth/me");
  expect((await beforeRevocation.json()).user?.email).toBe(email);

  const denied = await context.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);

  const storedRecord = await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: ["GET", `tap:v1:user:${id}`],
  }).then((response) => response.json());
  expect(JSON.parse(storedRecord.result).role).toBe("creator");
  const afterRevocation = await context.request.get("/api/auth/me");
  expect((await afterRevocation.json()).user).toBeNull();

  // Offboarding and index corruption have different operator actions. Keep the
  // exact reason load-bearing so future refactors cannot collapse both paths into
  // an ambiguous revocation event.
  const auditIds = await readStore(context, ["ZREVRANGE", "tap:v1:audits", 0, -1]);
  const events = await Promise.all((auditIds ?? []).map(async (auditId: string) => JSON.parse(await readStore(context, [`GET`, `tap:v1:audit:${auditId}`]))));
  const revocation = events.find((event) => event.action === "admin.revoked" && event.targetId === id);
  expect(revocation?.after?.reason).toBe("allowlist_removed");
  expect(revocation?.after?.sessionsRevoked).toBe(true);
  await context.close();
});

test("kode sekali pakai hanya mencetak satu session meski dikirim bersamaan", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Race QA", email: "race@tap.test", phone: "081234567966" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "race@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=race%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;
  const attempts = await Promise.all([1, 2].map(() => context.request.post("/api/auth/password/reset", {
    headers: { origin },
    data: { challengeId, code, password: "PasswordParalel2026" },
  })));
  // One contract, stated once: a duplicate confirmation is never told its code was
  // wrong, and 409 is a retry instruction rather than an outcome. Whatever the
  // timing, the sequence ends with exactly one session.
  expect(attempts.some((response) => response.status() === 400)).toBeFalsy();
  const bodies = [];
  for (const response of attempts) {
    if (response.status() === 409) {
      const retried = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordParalel2026" } });
      expect(retried.status()).toBe(200);
      bodies.push(await retried.json());
      continue;
    }
    expect(response.status()).toBe(200);
    bodies.push(await response.json());
  }
  expect(bodies.filter((body) => body.signedIn === true)).toHaveLength(1);
  expect(await sessionCount(context, viewer.user.id)).toBe(1);
  await context.close();
});

test("admin hanya diberikan setelah kepemilikan email terbukti", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const id = "unproven-admin";
  const now = "2026-01-01T00:00:00.000Z";
  // In the allowlist, but the address was never proven: grandfathered, pending.
  const user = { id, name: "Unproven Admin", email: "admin@tap.test", phone: "628123456777", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", emailVerifiedAt: now, verificationSource: "grandfathered", createdAt: now, updatedAt: now };
  await redis(context, ["SET", `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(context, ["SET", "tap:v1:email:admin@tap.test", id]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), id]);

  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "admin@tap.test", password: "Password2026" } });
  expect(signIn.status()).toBe(200);
  const denied = await context.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);

  const stored = await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: ["GET", `tap:v1:user:${id}`],
  }).then((response) => response.json());
  expect(JSON.parse(stored.result).role).toBe("creator");

  // Proving the address through a reset code is what earns the grant.
  const page = await context.newPage();
  await page.goto("/daftar?mode=login");
  await page.getByRole("button", { name: "Lupa kata sandi?" }).click();
  await page.getByLabel("Email").fill("admin@tap.test");
  await page.getByRole("button", { name: "Kirim kode reset" }).click();
  await expect(page.getByRole("heading", { name: "Buat kata sandi baru." })).toBeVisible();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=admin%40tap.test`).then((response) => response.json());
  await page.getByLabel("Kode enam digit").fill(outbox.emails.at(-1).code);
  await page.getByLabel("Kata sandi baru").fill("PasswordAdmin2026");
  await page.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const granted = await context.request.get("/api/admin/users");
  expect(granted.status()).toBe(200);
  await context.close();
});

test("nomor WhatsApp yang dikosongkan melepaskan klaim lamanya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Phone QA", email: "phone@tap.test", phone: "081234567988" });
  const cleared = await context.request.patch("/api/profile", { headers: { origin }, data: { name: "Phone QA", phone: "" } });
  expect(cleared.status()).toBe(200);
  const claim = await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: ["GET", "tap:v1:phone:6281234567988"],
  }).then((response) => response.json());
  expect(claim.result).toBeNull();
  await context.close();
});

test("dua permintaan kode bersamaan berbagi satu challenge yang benar", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Cooldown QA", email: "cooldown@tap.test", phone: "081234567911" });
  const [first, second] = await Promise.all([1, 2].map(() => context.request.post("/api/auth/verify/request", {
    headers: { origin },
    data: { email: "cooldown@tap.test", purpose: "reset" },
  })));
  expect([first.status(), second.status()].filter((status) => status === 200)).toHaveLength(2);
  const ids = [await first.json(), await second.json()].map((payload) => payload.challengeId);
  expect(ids[0]).toBe(ids[1]);
  const outbox = await context.request.get(`${storeUrl}/__emails?to=cooldown%40tap.test`).then((response) => response.json());
  const reset = await context.request.post("/api/auth/password/reset", {
    headers: { origin },
    data: { challengeId: ids[0], code: outbox.emails.at(-1).code, password: "PasswordBersama2026" },
  });
  expect(reset.status()).toBe(200);
  await context.close();
});

test("dua update profil paralel tidak meninggalkan claim yatim atau menghapus field", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Concurrent QA", email: "concurrent@tap.test", phone: "081234567801" });
  await context.request.patch("/api/profile", { headers: { origin }, data: { niche: "Beauty & Health", address: "Jl. Awal Nomor 1 Jakarta" } });

  const results = await Promise.all(["081234567802", "081234567803"].map((phone) => context.request.patch("/api/profile", {
    headers: { origin },
    data: { phone },
  })));
  // One writer wins outright; the other is either serialised or told to retry.
  expect(results.filter((response) => response.status() === 200).length).toBeGreaterThanOrEqual(1);
  expect(results.every((response) => [200, 409].includes(response.status()))).toBeTruthy();

  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  // Fields nobody touched must survive a phone-only PATCH.
  expect(viewer.user.niche).toBe("Beauty & Health");
  expect(viewer.user.address).toBe("Jl. Awal Nomor 1 Jakarta");

  const claimOwner = async (phone: string) => (await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: ["GET", `tap:v1:phone:${phone}`],
  }).then((response) => response.json())).result;
  const owners = await Promise.all(["6281234567801", "6281234567802", "6281234567803"].map(claimOwner));
  const held = owners.filter(Boolean);
  // Exactly one claim survives, and it is the number the record actually stores.
  expect(held).toHaveLength(1);
  expect(await claimOwner(viewer.user.phone)).toBeTruthy();
  await context.close();
});

test("PATCH parsial hanya mengubah field yang dikirim", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Partial QA", email: "partial@tap.test", phone: "081234567805" });
  await context.request.patch("/api/profile", {
    headers: { origin },
    data: { niche: "Fashion", address: "Jl. Lengkap Nomor 9 Bandung", tiktokUsername: "partialqa", followers: 12345 },
  });
  const only = await context.request.patch("/api/profile", { headers: { origin }, data: { recipientName: "Penerima Saja" } });
  expect(only.status()).toBe(200);
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  expect(viewer.user.recipientName).toBe("Penerima Saja");
  expect(viewer.user.niche).toBe("Fashion");
  expect(viewer.user.address).toBe("Jl. Lengkap Nomor 9 Bandung");
  expect(viewer.user.tiktokUsername).toBe("partialqa");
  expect(viewer.user.followers).toBe(12345);
  expect(viewer.user.phone).toBe("6281234567805");
  await context.close();
});

test("lock yang benar-benar ditahan memberi 409 dan kode masih bisa dipakai setelah lepas", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Lock QA", email: "lockqa@tap.test", phone: "081234567822" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "lockqa@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=lockqa%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  // Hold the record lock from outside, exactly as a slow writer would.
  await redis(context, ["SET", `tap:v1:lock:user:${viewer.user.id}`, "held-by-test", "PX", 4000]);
  const blocked = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordTerkunci2026" } });
  expect(blocked.status()).toBe(409);

  // The rejection must not have spent the code.
  await redis(context, ["DEL", `tap:v1:lock:user:${viewer.user.id}`]);
  const retried = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordTerkunci2026" } });
  expect(retried.status()).toBe(200);
  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "lockqa@tap.test", password: "PasswordTerkunci2026" } });
  expect(signIn.status()).toBe(200);
  await context.close();
});

test("lease yang benar-benar berpindah menghasilkan 409 dan kode tetap hidup", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Takeover QA", email: "takeover@tap.test", phone: "081234567866" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "takeover@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=takeover%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  // Hand the lease to another holder in the instant before the commit script runs.
  // Nothing is faulted: the script's own ownership check is what refuses, which is
  // the only way to prove `lock_lost` rather than a generic write failure.
  await context.request.post(`${storeUrl}/__steal`, { data: {
    command: "EVAL",
    match: "__commit_with_challenge__",
    key: `tap:v1:lock:user:${viewer.user.id}`,
    value: "held-by-rival",
    times: 1,
  } });
  const interrupted = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordPindah2026" } });
  expect(interrupted.status()).toBe(409);
  expect((await context.request.get(`${storeUrl}/__faults`).then((response) => response.json())).stolen).toBe(1);

  // Refusing before any write means the code is untouched and the record unchanged.
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}:guard`])).toBeTruthy();
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${viewer.user.id}`])).sessionsInvalidBefore).toBeUndefined();

  // The other holder finishes and releases the lease.
  await redis(context, ["DEL", `tap:v1:lock:user:${viewer.user.id}`]);
  const retried = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordPindah2026" } });
  expect(retried.status()).toBe(200);
  expect((await retried.json()).signedIn).toBe(true);
  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "takeover@tap.test", password: "PasswordPindah2026" } });
  expect(signIn.status()).toBe(200);
  await context.close();
});

test("intent pergantian nomor tidak meninggalkan anggota indeks mati", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Intent QA", email: "intent@tap.test", phone: "081234567833" });
  const moved = await context.request.patch("/api/profile", { headers: { origin }, data: { phone: "081234567844" } });
  expect(moved.status()).toBe(200);
  const store = async (command: Array<string | number>) => (await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: command,
  }).then((response) => response.json())).result;
  // A completed move leaves neither an intent nor a queue member behind.
  expect(await store(["ZCARD", "tap:v1:phone-intents"])).toBe(0);
  expect(await store(["GET", "tap:v1:phone:6281234567833"])).toBeNull();
  expect(await store(["GET", "tap:v1:phone:6281234567844"])).toBeTruthy();
  await context.close();
});

test("saga nomor gagal keras saat fase pelepasan gagal, lalu dipulihkan cron", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Saga QA", email: "saga@tap.test", phone: "081234567877" });
  const store = async (command: Array<string | number>) => (await context.request.post(`${storeUrl}`, {
    headers: { authorization: "Bearer tap-local-test-token" },
    data: command,
  }).then((response) => response.json())).result;
  const runCron = () => context.request.get("/api/cron/cleanup-users", { headers: { authorization: "Bearer e2e-cron-secret" } });

  // Fail exactly the release of the old claim — twice, so the inline repair that
  // follows the failure cannot succeed either. That is what forces the intent to
  // survive and leaves the work to the reconciler.
  await context.request.post(`${storeUrl}/__fail`, { data: { command: "EVAL", match: "tap:v1:phone:6281234567877", times: 2 } });
  const interrupted = await context.request.patch("/api/profile", { headers: { origin }, data: { phone: "081234567888" } });
  // A move that could not finish must not report success.
  expect(interrupted.status()).toBe(500);
  await context.request.post(`${storeUrl}/__fail`, { data: { reset: true } });

  // The intent survived, so the reconciler has something to work from.
  expect(await store(["ZCARD", "tap:v1:phone-intents"])).toBe(1);
  // The sweep deliberately ignores intents that may still be in flight, so age
  // this one past that threshold before asking the cron to settle it.
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  await redis(context, ["ZADD", "tap:v1:phone-intents", Date.now() - 20 * 60 * 1000, viewer.user.id]);
  expect(await runCron().then((response) => response.status())).toBe(200);
  expect(await store(["ZCARD", "tap:v1:phone-intents"])).toBe(0);
  const afterRepair = await context.request.get("/api/auth/me").then((response) => response.json());
  const claims = await Promise.all(["6281234567877", "6281234567888"].map((phone) => store(["GET", `tap:v1:phone:${phone}`])));
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await store(["GET", `tap:v1:phone:${afterRepair.user.phone}`])).toBeTruthy();
  await context.close();
});

test("housekeeping yang gagal setelah commit tetap 200, dicatat, lalu diselesaikan cron", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Settle QA", email: "settle@tap.test", phone: "081234567955" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "settle@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=settle%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  // Break exactly the release of the send pointer, which runs after the commit.
  // Nothing about it decides whether the password changed, so the caller must not
  // hear about it: reporting 500 here is what produced the retry in the first place.
  await arm(context, { command: "EVAL", match: "active:reset", times: 1 });
  const first = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordSettle2026" } });
  expect(first.status()).toBe(200);
  expect((await first.json()).signedIn).toBe(true);
  expect(await faultsFired(context)).toBe(1);
  await disarm(context);

  // The step that could not finish is written down, so it can be retried and seen.
  expect(await readStore(context, ["ZCARD", "tap:v1:challenge-settlements"])).toBe(1);
  const debt = JSON.parse(await readStore(context, [`GET`, `tap:v1:challenge-settlement:${viewer.user.id}`]));
  expect(debt.steps).toContain("send-pointer");
  expect(debt.purpose).toBe("reset");

  // Replay the same code, then again with a fresh attempt budget — the state an
  // hourly bucket rollover leaves behind while the receipt is still alive.
  for (const round of [1, 2]) {
    if (round === 2) await context.request.post(`${storeUrl}/__forget-limits`);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const replay = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordSettle2026" } });
      expect(replay.status()).toBe(200);
      const body = await replay.json();
      expect(body.signedIn).toBe(false);
      expect(body.user).toBeUndefined();
    }
  }
  // Six replays, one session: the count is the whole point of the fix.
  expect(await sessionCount(context, viewer.user.id)).toBe(1);

  // The sweep ignores debts that may still be in flight, so age this one first.
  await redis(context, ["ZADD", "tap:v1:challenge-settlements", Date.now() - 10 * 60 * 1000, viewer.user.id]);
  const cron = await context.request.get("/api/cron/cleanup-users", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).settlementsSettled).toBe(1);
  expect(await readStore(context, ["ZCARD", "tap:v1:challenge-settlements"])).toBe(0);

  // The retry may only sweep sessions the record already refuses. The one the
  // reset itself handed out was created after the cut-off and must survive.
  expect(await sessionCount(context, viewer.user.id)).toBe(1);
  const stillSignedIn = await context.request.get("/api/auth/me").then((response) => response.json());
  expect(stillSignedIn.user?.email).toBe("settle@tap.test");
  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "settle@tap.test", password: "PasswordSettle2026" } });
  expect(signIn.status()).toBe(200);
  await context.close();
});

test("receipt hanya menjawab tujuan dan payload yang benar-benar commit", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Bound QA", email: "bound@tap.test", phone: "081234567944" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "bound@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=bound%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  const landed = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordTerikat2026" } });
  expect(landed.status()).toBe(200);
  expect((await landed.json()).signedIn).toBe(true);

  // A reset receipt must not answer at the verify endpoint, even though both are
  // reached with the same challenge id.
  const crossPurpose = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code } });
  expect(crossPurpose.status()).toBe(400);

  // The same code with a different password is not the request that committed.
  const differentPayload = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordLain2026" } });
  expect(differentPayload.status()).toBe(400);

  // Neither refusal left a trace: no session, and the stored password is still
  // the one the commit set.
  expect(await sessionCount(context, viewer.user.id)).toBe(1);
  const wrong = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "bound@tap.test", password: "PasswordLain2026" } });
  expect(wrong.status()).toBe(401);
  const right = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "bound@tap.test", password: "PasswordTerikat2026" } });
  expect(right.status()).toBe(200);
  await context.close();
});

test("grant admin yang gagal setelah commit dipulihkan pada request admin berikutnya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const id = "pending-admin";
  const email = "admin@tap.test";
  const now = "2026-01-01T00:00:00.000Z";
  // In the allowlist, registered but never verified: the account that earns admin
  // access the moment it proves the address with a code.
  const user = { id, name: "Pending Admin", email, phone: "628123456799", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", emailVerificationStartedAt: now, createdAt: now, updatedAt: now };
  await redis(context, [`SET`, `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(context, [`SET`, `tap:v1:email:${email}`, id]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), id]);
  await redis(context, ["ZADD", "tap:v1:users:pending", Date.parse(now), id]);

  // A legacy account proves which principal it is by passing its own password
  // check; the login response carries that proof to the reissue.
  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "Password2026" } });
  expect(signIn.status()).toBe(403);
  const { continuation } = await signIn.json();
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "verify", continuation } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  // Fail the role write that follows the commit. Verification itself landed, so
  // the caller is signed in and told so; the grant is simply not applied yet.
  await arm(context, { command: "SET", match: `tap:v1:user:${id}`, times: 1 });
  const confirmed = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code } });
  expect(confirmed.status()).toBe(200);
  const body = await confirmed.json();
  expect(body.signedIn).toBe(true);
  expect(body.user.role).toBe("creator");
  expect(await faultsFired(context)).toBe(1);
  await disarm(context);

  const debt = JSON.parse(await readStore(context, [`GET`, `tap:v1:challenge-settlement:${id}`]));
  expect(debt.steps).toContain("admin-role");
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${id}`])).role).toBe("creator");

  // The allowlist is re-evaluated on every admin request, so the next one repairs
  // it without waiting for the sweep.
  const admin = await context.request.get("/api/admin/users");
  expect(admin.status()).toBe(200);
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${id}`])).role).toBe("admin");
  await context.close();
});

test("verify menolak mengambil klaim email milik akun lain", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const stale = "stale-email-verify";
  const email = "contested@tap.test";
  const old = "2026-01-01T00:00:00.000Z";
  // Registered, never verified, and in the meantime somebody else took the address.
  await redis(context, [`SET`, `tap:v1:user:${stale}`, JSON.stringify({ id: stale, name: "Stale Verify", email, phone: "628123456701", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", emailVerificationStartedAt: old, createdAt: old, updatedAt: old })]);
  await redis(context, [`SET`, `tap:v1:email:${email}`, "rival-user"]);
  await redis(context, ["SET", "tap:v1:phone:628123456701", stale]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), stale]);
  await redis(context, ["ZADD", "tap:v1:users:pending", Date.parse(old), stale]);
  const challengeId = "contested-email-challenge";
  const code = "112233";
  await plantChallenge(context, { challengeId, code, userId: stale, email, purpose: "verify" });

  const refused = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toContain("Email ini sudah dipakai akun lain");

  // Nothing moved: the claim still belongs to the other account, the code is not
  // spent, no receipt exists, and the record is still unverified.
  expect(await readStore(context, [`GET`, `tap:v1:email:${email}`])).toBe("rival-user");
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}:guard`])).toBeTruthy();
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}:receipt`])).toBeNull();
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${stale}`])).emailVerifiedAt).toBeUndefined();

  // Once the contested claim is freed, the same code still works — proof that the
  // refusal cost the owner nothing.
  await redis(context, [`DEL`, `tap:v1:email:${email}`]);
  const accepted = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code } });
  expect(accepted.status()).toBe(200);
  expect(await readStore(context, [`GET`, `tap:v1:email:${email}`])).toBe(stale);
  await context.close();
});

test("verify menolak mengambil klaim nomor WhatsApp milik akun lain", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const stale = "stale-phone-verify";
  const email = "contested-phone@tap.test";
  const phone = "628123456702";
  const old = "2026-01-01T00:00:00.000Z";
  await redis(context, [`SET`, `tap:v1:user:${stale}`, JSON.stringify({ id: stale, name: "Stale Phone", email, phone, passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", emailVerificationStartedAt: old, createdAt: old, updatedAt: old })]);
  await redis(context, [`SET`, `tap:v1:email:${email}`, stale]);
  await redis(context, [`SET`, `tap:v1:phone:${phone}`, "rival-user"]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), stale]);
  const challengeId = "contested-phone-challenge";
  const code = "445566";
  await plantChallenge(context, { challengeId, code, userId: stale, email, purpose: "verify" });

  const refused = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toContain("Nomor WhatsApp");
  expect(await readStore(context, [`GET`, `tap:v1:phone:${phone}`])).toBe("rival-user");
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}:guard`])).toBeTruthy();
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${stale}`])).emailVerifiedAt).toBeUndefined();
  await context.close();
});

test("kegagalan pembersihan challenge tercatat sebagai settlement debt", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Cleanup QA", email: "cleanup@tap.test", phone: "081234567922" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "cleanup@tap.test", purpose: "reset" } });
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=cleanup%40tap.test`).then((response) => response.json());
  const code = outbox.emails.at(-1).code;

  // Break the deletion of the challenge record itself. Swallowing this error made
  // settlement report the step as done while the challenge JSON was still there.
  await arm(context, { command: "DEL", match: "email-challenge", times: 1 });
  const landed = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordBersih2026" } });
  expect(landed.status()).toBe(200);
  expect((await landed.json()).signedIn).toBe(true);
  expect(await faultsFired(context)).toBe(1);
  await disarm(context);

  const debt = JSON.parse(await readStore(context, [`GET`, `tap:v1:challenge-settlement:${viewer.user.id}`]));
  expect(debt.steps).toContain("challenge");
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}`])).toBeTruthy();

  await redis(context, ["ZADD", "tap:v1:challenge-settlements", Date.now() - 10 * 60 * 1000, viewer.user.id]);
  const cron = await context.request.get("/api/cron/cleanup-users", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect((await cron.json()).settlementsSettled).toBe(1);
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}`])).toBeNull();
  await context.close();
});

test("kegagalan datastore pada membership bukan 404", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "Mapping Admin", email: "admin@tap.test", phone: "081234567911" });
  const creatorContext = await browser.newContext({ baseURL: origin });
  await register(await creatorContext.newPage(), { name: "Mapping Creator", email: "mapped@tap.test", phone: "081234567912" });
  const creator = (await context.request.get("/api/admin/users").then((response) => response.json()))
    .users.find((user: { email: string }) => user.email === "mapped@tap.test");

  // An account that genuinely does not exist is the only 404.
  const missing = await context.request.patch("/api/admin/users", { headers: { origin }, data: { userId: "tidak-ada", membership: "verified" } });
  expect(missing.status()).toBe(404);

  // A datastore that cannot answer is an outage, not a missing creator. Reporting
  // 404 here sends the admin looking for an account that is right in front of them.
  await arm(context, { command: "SET", match: `tap:v1:user:${creator.id}`, times: 1 });
  const broken = await context.request.patch("/api/admin/users", { headers: { origin }, data: { userId: creator.id, membership: "verified" } });
  expect(await faultsFired(context)).toBe(1);
  await disarm(context);
  expect(broken.status()).not.toBe(404);
  expect([500, 503]).toContain(broken.status());
  await creatorContext.close();
  await context.close();
});

test("klaim pendaftaran tidak punya masa berlaku sendiri", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const email = "ttl@tap.test";
  const registered = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "TTL QA", email, phone: "081234567810", password: "Password2026", consent: true },
  });
  expect(registered.status()).toBe(202);
  const { challengeId } = await registered.json();

  // The code expires; the claims do not. A claim with a lifetime of its own — even
  // a generous one — leaves a window where the record exists and the address is
  // free, and then the email index no longer says whose account it is.
  expect(Number(await readStore(context, [`TTL`, `tap:v1:email-challenge:${digest(challengeId)}`]))).toBeGreaterThan(0);
  expect(await readStore(context, ["TTL", `tap:v1:email:${email}`])).toBe(-1);
  expect(await readStore(context, ["TTL", "tap:v1:phone:6281234567810"])).toBe(-1);

  // Verification keeps them permanent rather than promoting them from a TTL.
  const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
  const confirmed = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code: outbox.emails.at(-1).code } });
  expect(confirmed.status()).toBe(200);
  expect(await readStore(context, ["TTL", `tap:v1:email:${email}`])).toBe(-1);
  expect(await readStore(context, ["TTL", "tap:v1:phone:6281234567810"])).toBe(-1);
  await context.close();
});

test("kode verifikasi tidak pernah diarahkan ke akun lain yang memegang email", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const email = "korban@tap.test";

  // Akun A: korban, mendaftar lebih dulu.
  const first = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Korban A", email, phone: "081234567850", password: "PasswordKorban2026", consent: true },
  });
  expect(first.status()).toBe(202);
  const a = await first.json();
  const victimId = JSON.parse(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(a.challengeId)}`])).userId;

  // Klaim A dilepas — keadaan legacy yang dulu terjadi ketika klaim punya TTL
  // sendiri. Akun B lalu mendaftar dengan email yang sama dan password pilihannya.
  await redis(context, [`DEL`, `tap:v1:email:${email}`]);
  await redis(context, [`DEL`, `tap:v1:email-challenge:active:verify:${digest(email)}`]);
  const second = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Rival B", email, phone: "081234567851", password: "PasswordRival2026", consent: true },
  });
  expect(second.status()).toBe(202);
  const b = await second.json();
  const rivalId = JSON.parse(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(b.challengeId)}`])).userId;
  expect(rivalId).not.toBe(victimId);
  // B is a real account, in both indexes, holding the email — not a dangling entry.
  expect(await readStore(context, [`GET`, `tap:v1:email:${email}`])).toBe(rivalId);
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${rivalId}`])).name).toBe("Rival B");

  // The inbox owner asks for a code with nothing but the address. Whoever holds
  // the index must not become the account that gets activated.
  const outboxCount = async () => (await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json())).emails.length;
  const before = await outboxCount();
  const emailOnly = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "verify" } });
  expect(emailOnly.status()).toBe(200);
  const emailOnlyBody = await emailOnly.json();
  expect(await outboxCount()).toBe(before);
  // The opaque challenge id must not name any real challenge.
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(emailOnlyBody.challengeId)}`])).toBeNull();

  // Continuation proof from B's own registration reissues for B only, and A's
  // proof reissues for A only. Neither is chosen by the address.
  for (const [proof, expected] of [[b.continuation, rivalId], [a.continuation, victimId]] as const) {
    const reissued = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "verify", continuation: proof } });
    expect(reissued.status()).toBe(200);
    const body = await reissued.json();
    const challenge = JSON.parse(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(body.challengeId)}`]));
    expect(challenge.userId).toBe(expected);
    await redis(context, [`DEL`, `tap:v1:email-challenge:active:verify:${digest(email)}`]);
  }
  await context.close();
});

test("pemilik inbox memulihkan akun lewat reset, dan password pihak lain mati", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const email = "pulih@tap.test";
  await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Korban A", email, phone: "081234567852", password: "PasswordKorban2026", consent: true },
  });
  await redis(context, [`DEL`, `tap:v1:email:${email}`]);
  await redis(context, [`DEL`, `tap:v1:email-challenge:active:verify:${digest(email)}`]);
  const rival = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Rival B", email, phone: "081234567853", password: "PasswordRival2026", consent: true },
  });
  expect(rival.status()).toBe(202);
  const rivalId = JSON.parse(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest((await rival.json()).challengeId)}`])).userId;
  await redis(context, [`DEL`, `tap:v1:email-challenge:active:verify:${digest(email)}`]);

  // Recovery without continuation proof goes through reset, which is allowed to
  // work from the address alone precisely because it replaces the credential the
  // other party chose.
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "reset" } });
  expect(requested.status()).toBe(200);
  const { challengeId } = await requested.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
  const reset = await context.request.post("/api/auth/password/reset", {
    headers: { origin },
    data: { challengeId, code: outbox.emails.at(-1).code, password: "PasswordPemilik2026" },
  });
  expect(reset.status()).toBe(200);
  expect((await reset.json()).signedIn).toBe(true);

  // The password the other party chose no longer opens the account they created.
  const rivalLogin = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "PasswordRival2026" } });
  expect(rivalLogin.status()).toBe(401);
  const ownerLogin = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "PasswordPemilik2026" } });
  expect(ownerLogin.status()).toBe(200);
  // Sessions issued before the reset are gone, and the claim is permanent now.
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${rivalId}`])).sessionsInvalidBefore).toBeTruthy();
  expect(await readStore(context, ["TTL", `tap:v1:email:${email}`])).toBe(-1);
  await context.close();
});

test("verifikasi tanpa bukti dicatat, dan akun verified tidak dapat diarahkan ulang", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  await register(page, { name: "Sudah Verified", email: "verified@tap.test", phone: "081234567854" });

  // An account that is already verified must not be re-targeted, even with proof.
  const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email: "verified@tap.test", purpose: "verify" } });
  expect(requested.status()).toBe(200);
  expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest((await requested.json()).challengeId)}`])).toBeNull();

  const adminContext = await browser.newContext({ baseURL: origin });
  await register(await adminContext.newPage(), { name: "Audit Admin", email: "admin@tap.test", phone: "081234567855" });
  const trail = await adminContext.request.get("/api/admin/audits").then((response) => response.json());
  const refusals = trail.events.filter((event: { action: string }) => event.action === "verify.principal_unproven");
  // Somebody may be locked out with an expired code; support has to be able to see it.
  expect(refusals.length).toBeGreaterThanOrEqual(1);
  expect(refusals[0].targetId).toBe("verified@tap.test");
  await adminContext.close();
  await context.close();
});

test("pendaftaran terbengkalai melepas klaimnya untuk pendaftar berikutnya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const email = "terbengkalai@tap.test";
  const registered = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Terbengkalai", email, phone: "081234567856", password: "Password2026", consent: true },
  });
  expect(registered.status()).toBe(202);
  const abandonedId = JSON.parse(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest((await registered.json()).challengeId)}`])).userId;
  // The claim never expires on its own now, so a fresh signup is refused.
  expect(await readStore(context, ["TTL", `tap:v1:email:${email}`])).toBe(-1);
  const blocked = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Pendaftar Baru", email, phone: "081234567857", password: "Password2026", consent: true },
  });
  expect(blocked.status()).toBe(409);

  // Age the abandoned registration past its window: the next signup releases it
  // instead of waiting for the nightly sweep.
  const stale = { ...JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${abandonedId}`])), emailVerificationStartedAt: "2026-01-01T00:00:00.000Z" };
  await redis(context, [`SET`, `tap:v1:user:${abandonedId}`, JSON.stringify(stale)]);
  await redis(context, [`DEL`, `tap:v1:email-challenge:active:verify:${digest(email)}`]);
  const accepted = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Pendaftar Baru", email, phone: "081234567857", password: "Password2026", consent: true },
  });
  expect(accepted.status()).toBe(202);
  expect(await readStore(context, [`GET`, `tap:v1:user:${abandonedId}`])).toBeNull();
  await context.close();
});

test("claim conflict tercatat untuk support tanpa membocorkan pemiliknya", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const email = "audited@tap.test";
  const registered = await context.request.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Audit QA", email, phone: "081234567830", password: "Password2026", consent: true },
  });
  const { challengeId } = await registered.json();
  const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
  await redis(context, [`SET`, `tap:v1:email:${email}`, "rival-user"]);

  // A reissue with nothing but the address is refused outright now, and that
  // refusal is recorded — support needs to find these accounts without waiting
  // for someone to complain.
  const blockedRequest = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "verify" } });
  expect(blockedRequest.status()).toBe(200);
  const blockedCommit = await context.request.post("/api/auth/verify/confirm", { headers: { origin }, data: { challengeId, code: outbox.emails.at(-1).code } });
  expect(blockedCommit.status()).toBe(409);
  // The caller is told which datum is contested, never who holds it.
  const shown = (await blockedCommit.json()).error;
  expect(shown).toContain("Email ini sudah dipakai akun lain");
  expect(shown).not.toContain("rival-user");

  const adminContext = await browser.newContext({ baseURL: origin });
  await register(await adminContext.newPage(), { name: "Audit Admin", email: "admin@tap.test", phone: "081234567840" });
  const trail = await adminContext.request.get("/api/admin/audits").then((response) => response.json());
  const conflicts = trail.events.filter((event: { action: string }) => event.action === "challenge.claim_conflict");
  expect(conflicts.map((event: { before: { stage: string } }) => event.before.stage)).toContain("commit");
  // The owner is in the admin-only trail, which is the one place support can act on.
  expect(conflicts.some((event: { after: { heldBy: string | null } }) => event.after.heldBy === "rival-user")).toBeTruthy();
  const refusals = trail.events.filter((event: { action: string }) => event.action === "verify.principal_unproven");
  expect(refusals.map((event: { targetId: string }) => event.targetId)).toContain(email);
  await adminContext.close();
  await context.close();
});

for (const claim of ["email", "phone"] as const) {
  test(`reset menolak commit ketika klaim ${claim} pindah ke akun lain`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    await resetStore(context);
    const page = await context.newPage();
    const email = `konflik-${claim}@tap.test`;
    const phone = claim === "phone" ? "081234567860" : "081234567861";
    await register(page, { name: "Pemilik", email, phone });
    const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
    const ownerId = viewer.user.id;
    const storedPhone = viewer.user.phone;

    const requested = await context.request.post("/api/auth/verify/request", { headers: { origin }, data: { email, purpose: "reset" } });
    const { challengeId } = await requested.json();
    const outbox = await context.request.get(`${storeUrl}/__emails?to=${encodeURIComponent(email)}`).then((response) => response.json());
    const code = outbox.emails.at(-1).code;

    // A real rival account takes the claim in the window between the code being
    // sent and the code being used — the state the commit script is there to catch.
    // Its own record carries the contested datum, so the index and the record agree
    // on who owns it: a rival whose record named a different address would prove
    // only that the index pointed elsewhere.
    const rivalId = "rival-nyata";
    const now = "2026-01-01T00:00:00.000Z";
    const rival = {
      id: rivalId,
      name: "Rival Nyata",
      email: claim === "email" ? email : "rival@tap.test",
      phone: claim === "phone" ? storedPhone : "628123456999",
      passwordHash: await hashPassword("PasswordRival2026"),
      provider: "credentials", role: "creator", membership: "pending",
      emailVerifiedAt: now, verificationSource: "code", createdAt: now, updatedAt: now,
    };
    await redis(context, [`SET`, `tap:v1:user:${rivalId}`, JSON.stringify(rival)]);
    await redis(context, ["ZADD", "tap:v1:users", Date.now(), rivalId]);
    const contested = claim === "email" ? `tap:v1:email:${email}` : `tap:v1:phone:${storedPhone}`;
    await redis(context, [`SET`, contested, rivalId]);

    // The stored string itself, so "unchanged" means the bytes never moved rather
    // than two objects comparing equal after a parse.
    const before = await readStore(context, [`GET`, `tap:v1:user:${ownerId}`]);
    const sessionsBefore = await sessionCount(context, ownerId);
    const refused = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordBaru2026" } });

    // A commit the script refused must not be reported as done, and must not hand
    // out a session for a change that did not happen.
    expect(refused.status()).toBe(409);
    expect(refused.headers()["set-cookie"]).toBeUndefined();
    expect((await refused.json()).error).toContain(claim === "phone" ? "Nomor WhatsApp" : "Email");
    expect(await sessionCount(context, ownerId)).toBe(sessionsBefore);

    // Nothing moved: the record is byte-for-byte what it was, the other account
    // keeps its claim, and the code is still unspent.
    expect(await readStore(context, [`GET`, `tap:v1:user:${ownerId}`])).toBe(before);
    expect(JSON.parse(before).sessionsInvalidBefore).toBeUndefined();
    expect(await readStore(context, [`GET`, contested])).toBe(rivalId);
    expect(await readStore(context, [`GET`, `tap:v1:email-challenge:${digest(challengeId)}:guard`])).toBeTruthy();
    // Once the claim is back — the login lookup goes through the email index, so
    // this has to be checked with the account reachable again.
    await redis(context, [`SET`, contested, ownerId]);
    const oldPassword = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "Password2026" } });
    expect(oldPassword.status()).toBe(200);
    const newPassword = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "PasswordBaru2026" } });
    expect(newPassword.status()).toBe(401);

    // The same code still works, so the refusal cost the owner nothing.
    const accepted = await context.request.post("/api/auth/password/reset", { headers: { origin }, data: { challengeId, code, password: "PasswordBaru2026" } });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).signedIn).toBe(true);
    const settled = await context.request.post("/api/auth/login", { headers: { origin }, data: { email, password: "PasswordBaru2026" } });
    expect(settled.status()).toBe(200);
    await context.close();
  });
}

test("admin dicabut ketika index email alamatnya dipegang akun lain", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const page = await context.newPage();
  // A holds admin through the allowlisted address and owns the index for it.
  await register(page, { name: "Admin A", email: "admin@tap.test", phone: "081234567870" });
  const viewer = await context.request.get("/api/auth/me").then((response) => response.json());
  const adminId = viewer.user.id;
  expect((await context.request.get("/api/admin/users")).status()).toBe(200);
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${adminId}`])).role).toBe("admin");

  // Account B, a real record, comes to hold the index for that same address —
  // A still carries the allowlisted email and a proven verificationSource, so
  // every check that looked only at the allowlist kept A as admin.
  const rivalId = "pemegang-index";
  const now = "2026-01-01T00:00:00.000Z";
  await redis(context, [`SET`, `tap:v1:user:${rivalId}`, JSON.stringify({ id: rivalId, name: "Akun B", email: "admin@tap.test", phone: "628123456888", passwordHash: await hashPassword("PasswordB2026"), provider: "credentials", role: "creator", membership: "pending", emailVerifiedAt: now, verificationSource: "code", createdAt: now, updatedAt: now })]);
  await redis(context, ["ZADD", "tap:v1:users", Date.now(), rivalId]);
  await redis(context, [`SET`, "tap:v1:email:admin@tap.test", rivalId]);

  // Holding the address is what entitles an account to admin, so A loses it on
  // its next admin request — and loses its sessions with it.
  const denied = await context.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);
  expect(JSON.parse(await readStore(context, [`GET`, `tap:v1:user:${adminId}`])).role).toBe("creator");
  expect(await sessionCount(context, adminId)).toBe(0);

  // The trail has to say *why*, or an operator reading it cannot tell an index
  // problem from an offboarding. Read straight from the datastore: the account
  // that would normally read the audit log just lost its access.
  const auditIds = await readStore(context, ["ZREVRANGE", "tap:v1:audits", 0, -1]);
  const events = await Promise.all((auditIds ?? []).map(async (id: string) => JSON.parse(await readStore(context, [`GET`, `tap:v1:audit:${id}`]))));
  const revocation = events.find((event) => event.action === "admin.revoked" && event.targetId === adminId);
  expect(revocation?.after?.reason).toBe("email_index_mismatch");
  expect(revocation?.after?.sessionsRevoked).toBe(true);

  // Restoring the index restores the entitlement, so this is a binding rule and
  // not a one-way door: signing in again gives A admin back.
  await redis(context, [`SET`, "tap:v1:email:admin@tap.test", adminId]);
  const signIn = await context.request.post("/api/auth/login", { headers: { origin }, data: { email: "admin@tap.test", password: "Password2026" } });
  expect(signIn.status()).toBe(200);
  expect((await context.request.get("/api/admin/users")).status()).toBe(200);
  await context.close();
});

test("penanda SKU baru terpisah antar platform dan muncul di beranda", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "SKU Admin", email: "admin@tap.test", phone: "081234567934" });

  // "Glow Better" sengaja ada di kedua fixture, meniru 94 brand yang namanya
  // dipakai di TikTok dan Shopee sekaligus.
  const before = await context.request.get("/api/campaigns?platform=shopee").then((response) => response.json());
  expect(before.campaigns.some((item: { brand: string }) => item.brand === "Glow Better")).toBe(true);

  const saved = await context.request.patch("/api/admin/catalog", {
    headers: { origin },
    data: { brandKey: "glowbetter", platform: "tiktok", newSku: true },
  });
  expect(saved.ok()).toBeTruthy();

  // Penanda milik TikTok tidak boleh ikut menyalakan kartu Shopee bernama sama.
  const tiktok = await context.request.get("/api/campaigns").then((response) => response.json());
  const shopee = await context.request.get("/api/campaigns?platform=shopee").then((response) => response.json());
  expect(tiktok.campaigns.find((item: { id: string }) => item.id === "glow-better").newSku).toBe(true);
  expect(shopee.campaigns.find((item: { brand: string }) => item.brand === "Glow Better").newSku).toBe(false);

  // Beranda menampilkan barisnya, dan kartunya membawa badge.
  const home = await context.newPage();
  await home.goto("/");
  const highlight = home.locator("#new-sku");
  await expect(highlight).toBeVisible();
  await expect(highlight.getByRole("heading", { name: /SKU baru/ })).toBeVisible();
  await expect(highlight.locator(".new-sku-card").filter({ hasText: "Glow Better" })).toHaveCount(1);
  await expect(
    home.locator(".deal-card").filter({ hasText: "Glow Better" }).locator(".badge-new-sku").first(),
  ).toHaveText("New SKU");

  // Mencabut penandanya membuat barisnya hilang lagi, bukan menyisakan section kosong.
  const cleared = await context.request.patch("/api/admin/catalog", {
    headers: { origin },
    data: { brandKey: "glowbetter", platform: "tiktok", newSku: false },
  });
  expect(cleared.ok()).toBeTruthy();
  await home.reload();
  await expect(home.locator("#new-sku")).toHaveCount(0);

  await context.close();
});

test("override Shopee tidak pernah menambah campaign buatan admin", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin });
  await resetStore(context);
  const admin = await context.newPage();
  await register(admin, { name: "Manual Admin", email: "admin@tap.test", phone: "081234567935" });

  const before = await context.request.get("/api/campaigns?platform=shopee").then((response) => response.json());

  // Campaign manual selalu berbentuk TikTok: punya tier dan komisi. Kalau ikut
  // masuk ke Shopee, katalog itu akan memuat angka yang sheet-nya tidak punya.
  const saved = await context.request.patch("/api/admin/catalog", {
    headers: { origin },
    data: {
      brandKey: "brandkarangan",
      displayName: "Brand Karangan",
      manualTiers: [{ label: "Manual", commission: 10, tapLink: "https://affiliate-id.tokopedia.com/api/v1/share/manual", hasSample: false }],
    },
  });
  expect(saved.ok()).toBeTruthy();

  const shopee = await context.request.get("/api/campaigns?platform=shopee").then((response) => response.json());
  expect(shopee.campaigns.length).toBe(before.campaigns.length);
  expect(shopee.campaigns.some((item: { brand: string }) => item.brand === "Brand Karangan")).toBe(false);
  expect(shopee.campaigns.every((item: { platform: string }) => item.platform === "Shopee Affiliate")).toBe(true);

  // Di TikTok campaign itu memang harus muncul.
  const tiktok = await context.request.get("/api/campaigns").then((response) => response.json());
  expect(tiktok.campaigns.some((item: { brand: string }) => item.brand === "Brand Karangan")).toBe(true);

  await context.close();
});

