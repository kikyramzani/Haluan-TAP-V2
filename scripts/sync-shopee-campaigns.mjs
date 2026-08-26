const sourceUrl = process.argv[2];
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!sourceUrl || !redisUrl || !redisToken) {
  console.error("Usage: node --env-file=<production-env> scripts/sync-shopee-campaigns.mjs <https-csv-url>");
  process.exit(1);
}

const source = new URL(sourceUrl);
if (source.protocol !== "https:") throw new Error("Shopee source must use HTTPS");

const response = await fetch(source, { headers: { accept: "text/csv" }, redirect: "follow" });
if (!response.ok) throw new Error(`Shopee source returned HTTP ${response.status}`);
const csv = await response.text();
const firstLine = csv.slice(0, csv.indexOf("\n")).replace(/\r$/, "");
if (!firstLine.includes("Link Campaign Shopee")) throw new Error("Shopee CSV is missing Link Campaign Shopee");
const validLinkCount = (csv.match(/https:\/\//g) || []).length;
if (validLinkCount < 1) throw new Error("Shopee CSV contains no HTTPS links");
if (csv.length > 5_000_000) throw new Error("Shopee CSV exceeds the 5 MB safety limit");

const result = await fetch(redisUrl.replace(/\/$/, ""), {
  method: "POST",
  headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
  body: JSON.stringify(["SET", "tap:v1:campaign-links:shopee:csv", csv]),
});
const payload = await result.json();
if (!result.ok || payload.error || payload.result !== "OK") throw new Error(payload.error || `Redis returned HTTP ${result.status}`);

console.log(`Imported Shopee campaign feed (${Math.round(csv.length / 1024)} KiB, ${validLinkCount} HTTPS values) into private TAP storage.`);
