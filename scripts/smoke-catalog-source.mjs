const origin = process.env.TAP_ORIGIN || "https://haluan-tap.vercel.app";
for (const path of ["/api/campaigns", "/api/campaigns?platform=shopee"]) {
  const response = await fetch(`${origin}${path}`);
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.campaigns) || !body.campaigns.length) throw new Error(`Live catalog smoke failed: ${path}`);
  process.stdout.write(`PASS ${path}: ${body.campaigns.length} records\n`);
}
