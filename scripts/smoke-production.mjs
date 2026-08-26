const baseUrl = (process.env.TAP_BASE_URL || process.argv[2] || "https://haluan-tap.vercel.app").replace(/\/$/, "");
const allowConfigurationRequired = process.argv.includes("--allow-configuration-required");

const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, run) {
  try {
    await run();
    checks.push({ name, status: "PASS" });
  } catch (error) {
    checks.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

function keysDeep(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, result);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      result.push(key.toLowerCase());
      keysDeep(item, result);
    }
  }
  return result;
}

await check("health gate", async () => {
  const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  const body = await response.json();
  if (allowConfigurationRequired) {
    assert([200, 503].includes(response.status), `status ${response.status}`);
  } else {
    assert(response.status === 200, `status ${response.status}: ${JSON.stringify(body)}`);
    assert(body.status === "ready", `status is ${body.status}`);
    assert(Object.keys(body).length === 1, "health endpoint exposes internal configuration details");
  }
});

await check("public catalog is populated and sanitized", async () => {
  const response = await fetch(`${baseUrl}/api/campaigns`, { cache: "no-store" });
  assert(response.status === 200, `status ${response.status}`);
  const body = await response.json();
  assert(Array.isArray(body.campaigns) && body.campaigns.length > 0, "catalog is empty");
  const forbidden = new Set(["link", "links", "url", "urls", "affiliateurl", "taplink", "rawlink"]);
  const leakedKey = keysDeep(body).find((key) => forbidden.has(key));
  assert(!leakedKey, `public response exposes forbidden key: ${leakedKey}`);
});

await check("Shopee catalog is populated and sanitized", async () => {
  const response = await fetch(`${baseUrl}/api/campaigns?platform=shopee`, { cache: "no-store" });
  assert(response.status === 200, `status ${response.status}`);
  const body = await response.json();
  assert(Array.isArray(body.campaigns) && body.campaigns.length > 0, "Shopee catalog is empty");
  const forbidden = new Set(["link", "links", "url", "urls", "affiliateurl", "taplink", "rawlink"]);
  const leakedKey = keysDeep(body).find((key) => forbidden.has(key));
  assert(!leakedKey, `public Shopee response exposes forbidden key: ${leakedKey}`);
  assert(body.campaigns.every((item) => item.delta === null), "Shopee catalog fabricates commission delta");
});

await check("anonymous admin API is denied", async () => {
  const response = await fetch(`${baseUrl}/api/admin/metrics`, { redirect: "manual" });
  assert(response.status === 403, `status ${response.status}`);
});

await check("creator area is session-gated", async () => {
  const response = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  assert([302, 303, 307, 308].includes(response.status), `status ${response.status}`);
  assert(new URL(response.headers.get("location"), baseUrl).pathname === "/daftar", "dashboard did not redirect to /daftar");
});

await check("creator sign-in entry is available", async () => {
  const response = await fetch(`${baseUrl}/daftar?mode=login`, { redirect: "manual" });
  assert(response.status === 200, `status ${response.status}`);
  const html = await response.text();
  assert(html.includes("Masuk") && html.includes("Kata sandi"), "sign-in form is missing");
});

await check("security headers are active", async () => {
  const response = await fetch(baseUrl, { redirect: "manual" });
  assert(response.status === 200, `status ${response.status}`);
  assert(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP missing frame-ancestors");
  assert(response.headers.get("strict-transport-security")?.includes("includeSubDomains"), "HSTS missing");
  assert(response.headers.get("x-frame-options") === "DENY", "X-Frame-Options is not DENY");
  assert(response.headers.get("x-content-type-options") === "nosniff", "nosniff header missing");
  const csp = response.headers.get("content-security-policy") || "";
  assert(/script-src[^;]*'nonce-[^']+'/.test(csp), "CSP script nonce missing");
  assert(!/script-src[^;]*'unsafe-inline'/.test(csp), "CSP script-src allows unsafe-inline");

  const prefetch = await fetch(baseUrl, { headers: { purpose: "prefetch", "next-router-prefetch": "1" } });
  assert(prefetch.headers.get("content-security-policy"), "CSP missing on prefetch response");
  const api = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
  assert(api.headers.get("content-security-policy"), "CSP missing on API response");
});

await check("canonical host is live", async () => {
  const catalog = await fetch(`${baseUrl}/api/campaigns`, { cache: "no-store" }).then((response) => response.json());
  const campaignId = catalog.campaigns?.[0]?.id;
  assert(campaignId, "catalog has no campaign for canonical check");
  const response = await fetch(`${baseUrl}/deal/${encodeURIComponent(campaignId)}`, { cache: "no-store" });
  const html = await response.text();
  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
    ?? html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/)?.[1];
  assert(canonical, "canonical link is missing");
  const canonicalUrl = new URL(canonical);
  const canonicalResponse = await fetch(canonicalUrl, { redirect: "manual", cache: "no-store" });
  assert(canonicalResponse.status === 200, `canonical host returned ${canonicalResponse.status}`);
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1]
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/)?.[1];
  assert(ogImage, "og:image is missing");
  const imageResponse = await fetch(new URL(ogImage), { redirect: "manual", cache: "no-store" });
  assert(imageResponse.status === 200, `og:image returned ${imageResponse.status}`);
});

await check("custom 404 is served", async () => {
  const response = await fetch(`${baseUrl}/smoke-test-not-found`, { redirect: "manual" });
  assert(response.status === 404, `status ${response.status}`);
  assert((await response.text()).includes("Halaman tidak ditemukan"), "custom 404 copy missing");
});


await check("version endpoint proves which commit is serving", async () => {
  // "The suite is green" and "this is what the domain runs" are separate claims;
  // this is where they meet. EXPECTED_COMMIT pins the exact SHA when a promotion
  // knows it; without it, a production deployment still has to identify itself.
  const response = await fetch(`${baseUrl}/api/version`, { cache: "no-store" });
  assert(response.status === 200, `version endpoint answered ${response.status}`);
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert(cacheControl.includes("no-store"), `version response must not be cacheable; got "${cacheControl}"`);
  const payload = await response.json();
  if (payload.environment === "production") {
    assert(payload.ok === true, `version endpoint reports not-ok: ${payload.reason ?? "unknown"}`);
    assert(/^[0-9a-f]{40}$/.test(payload.commit ?? ""), `production must name a full commit; got ${JSON.stringify(payload.commit)}`);
    assert(Boolean(payload.deploymentId), "production must name its deployment id");
  }
  const expected = process.env.EXPECTED_COMMIT;
  if (expected) {
    assert(payload.commit === expected, `production serves ${payload.commit}; expected ${expected}`);
  }
});

for (const item of checks) {
  console.log(`${item.status.padEnd(4)}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}

const failures = checks.filter((item) => item.status === "FAIL");
console.log(`\n${checks.length - failures.length}/${checks.length} production checks passed for ${baseUrl}`);
if (failures.length) process.exitCode = 1;
