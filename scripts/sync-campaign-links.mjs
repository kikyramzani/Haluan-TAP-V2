const sourceUrl = process.argv[2];
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!sourceUrl || !redisUrl || !redisToken) {
  console.error("Usage: node --env-file=<production-env> scripts/sync-campaign-links.mjs <https-csv-url>");
  process.exit(1);
}

const source = new URL(sourceUrl);
if (source.protocol !== "https:") throw new Error("Campaign source must use HTTPS");

const response = await fetch(source, { headers: { accept: "text/csv" }, redirect: "follow" });
if (!response.ok) throw new Error(`Campaign source returned HTTP ${response.status}`);
const csv = await response.text();

const firstLine = csv.slice(0, csv.indexOf("\n")).replace(/\r$/, "");
const headers = firstLine.split(",").map((value) => value.replace(/^"|"$/g, "").trim());
if (!headers.includes("Brand")) throw new Error("Campaign CSV is missing Brand");

// Ekspor terbaru memakai "TAP LINK URL" karena kolom "TAP LINK" di worksheet
// hanya menyimpan hyperlink, bukan teks, sehingga selalu kosong saat diekspor.
const linkHeader = ["TAP LINK URL", "TAP LINK"].find((header) => headers.includes(header));
if (!linkHeader) throw new Error("Campaign CSV is missing TAP LINK URL (or TAP LINK)");

const validLinkCount = (csv.match(/https:\/\//g) || []).length;
if (validLinkCount < 1) {
  throw new Error(
    `Campaign CSV has a "${linkHeader}" column but no HTTPS values. In the worksheet the TAP link is stored ` +
      "as a cell hyperlink, not as text, so a CSV export empties it. Run the materialiseTapLinks Apps Script " +
      "on the sheet first, then export the column it writes.",
  );
}
if (csv.length > 5_000_000) throw new Error("Campaign CSV exceeds the 5 MB safety limit");

const result = await fetch(redisUrl.replace(/\/$/, ""), {
  method: "POST",
  headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
  body: JSON.stringify(["SET", "tap:v1:campaign-links:csv", csv]),
});
const payload = await result.json();
if (!result.ok || payload.error || payload.result !== "OK") throw new Error(payload.error || `Redis returned HTTP ${result.status}`);

console.log(`Imported campaign feed (${Math.round(csv.length / 1024)} KiB, ${validLinkCount} HTTPS values) into private TAP storage.`);
