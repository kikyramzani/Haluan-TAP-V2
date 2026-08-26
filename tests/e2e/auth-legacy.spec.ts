// Named for what it is, so a local helper called `store` cannot shadow it —
// which it did, turning the constant into a reference to itself.
const storeUrl = `http://127.0.0.1:${process.env.MOCK_REDIS_PORT ?? 6381}`;
import { expect, test, type APIRequestContext } from "@playwright/test";
import { hashPassword } from "../../lib/password";

const redisUrl = `${storeUrl}`;
const redisHeaders = { authorization: "Bearer tap-local-test-token" };

async function redis(request: APIRequestContext, data: Array<string | number>) {
  const response = await request.post(redisUrl, { headers: redisHeaders, data });
  expect(response.ok()).toBeTruthy();
}

test("akun legacy tetap dapat masuk ketika email provider belum aktif", async ({ page, request }) => {
  await request.post(`${redisUrl}/__reset`);
  const id = "legacy-user";
  const email = "legacy@tap.test";
  const now = "2026-01-01T00:00:00.000Z";
  const user = { id, name: "Legacy Creator", email, phone: "628123456700", passwordHash: await hashPassword("Password2026"), provider: "credentials", role: "creator", membership: "pending", createdAt: now, updatedAt: now };
  await redis(request, ["SET", `tap:v1:user:${id}`, JSON.stringify(user)]);
  await redis(request, ["SET", `tap:v1:email:${email}`, id]);
  await redis(request, ["ZADD", "tap:v1:users", Date.now(), id]);

  const serverHtml = await request.get("/daftar?mode=login").then((response) => response.text());
  expect(serverHtml).toContain("Masuk ke akunmu.");
  expect(serverHtml).not.toContain("Mulai dalam satu menit.");

  await page.goto("/daftar?mode=login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill("Password2026");
  await page.getByRole("button", { name: "Masuk creator" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
