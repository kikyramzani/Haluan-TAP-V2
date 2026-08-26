/**
 * Mengimpor worksheet "GMV Campaign Brand" ke penyimpanan privat TAP.
 *
 * Sheet ini memuat data komersial internal. Yang dipakai aplikasi hanya kolom
 * Sample support dan peringkat relatif GMV; nilai rupiahnya tidak pernah keluar
 * dari server. Feed ini opsional — katalog tetap tampil tanpa sinkronisasi ini.
 */
const sourceUrl = process.argv[2];
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!sourceUrl || !redisUrl || !redisToken) {
  console.error("Usage: node --env-file=<production-env> scripts/sync-brand-metrics.mjs <https-csv-url>");
  process.exit(1);
}

const source = new URL(sourceUrl);
if (source.protocol !== "https:") throw new Error("Brand metrics source must use HTTPS");

const response = await fetch(source, { headers: { accept: "text/csv" }, redirect: "follow" });
if (!response.ok) throw new Error(`Brand metrics source returned HTTP ${response.status}`);
const csv = await response.text();

// Baris header tidak di baris pertama: ada banner bulan dan baris TOTAL di atasnya.
const headerLine = csv
  .split("\n", 20)
  .find((line) => /sample support/i.test(line) && /row labels|brand/i.test(line));
if (!headerLine) throw new Error("Brand metrics CSV is missing the Sample support header row");

const rowCount = csv.split("\n").filter((line) => line.trim()).length;
if (rowCount < 2) throw new Error("Brand metrics CSV contains no data rows");
if (csv.length > 5_000_000) throw new Error("Brand metrics CSV exceeds the 5 MB safety limit");

const result = await fetch(redisUrl.replace(/\/$/, ""), {
  method: "POST",
  headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
  body: JSON.stringify(["SET", "tap:v1:brand-metrics:csv", csv]),
});
const payload = await result.json();
if (!result.ok || payload.error || payload.result !== "OK") throw new Error(payload.error || `Redis returned HTTP ${result.status}`);

console.log(`Imported brand metrics (${Math.round(csv.length / 1024)} KiB, ${rowCount} rows) into private TAP storage.`);
