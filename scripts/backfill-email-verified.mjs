import { backfillLegacyVerification, needsLegacyVerificationBackfill } from "../lib/user-migration.ts";

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const apply = process.argv.includes("--apply");

if (!redisUrl || !redisToken) {
  console.error("Jalankan dengan env production: node --env-file=.env.production.local scripts/backfill-email-verified.mjs [--apply]");
  process.exit(1);
}

async function command(...args) {
  const response = await fetch(redisUrl.replace(/\/$/, ""), {
    method: "POST",
    headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || `Redis ${response.status}`);
  return payload.result;
}

const ids = await command("ZREVRANGE", "tap:v1:users", 0, -1) || [];
const users = [];
for (let start = 0; start < ids.length; start += 250) {
  const batch = ids.slice(start, start + 250);
  const values = await command("MGET", ...batch.map((id) => `tap:v1:user:${id}`)) || [];
  for (const value of values) if (value) users.push(typeof value === "string" ? JSON.parse(value) : value);
}

const legacy = users.filter(needsLegacyVerificationBackfill);
const pending = users.filter((user) => !user.emailVerifiedAt && user.emailVerificationStartedAt);
console.log(`Users scanned: ${users.length}`);
console.log(`Legacy users requiring backfill: ${legacy.length}`);
console.log(`Pending verification (not touched): ${pending.length}`);

if (!apply) {
  for (const user of legacy) console.log(`DRY RUN\t${user.id}\t${user.email}\t${user.role}`);
  for (const user of pending) console.log(`DRY RUN INDEX\t${user.id}\t${user.email}\t${user.emailVerificationStartedAt}`);
  console.log("Dry-run only. Tambahkan --apply untuk menulis migrasi.");
  process.exit(0);
}

const migratedAt = new Date().toISOString();
for (const user of legacy) {
  await command("SET", `tap:v1:user:${user.id}`, JSON.stringify(backfillLegacyVerification(user, migratedAt)));
}
// Accounts that were already awaiting verification predate the pending index;
// without this they would never be reached by the nightly expiry sweep.
for (const user of pending) {
  await command("ZADD", "tap:v1:users:pending", Date.parse(user.emailVerificationStartedAt), user.id);
}
await command("INCR", "tap:v1:users:revision");
console.log(`Applied emailVerifiedAt to ${legacy.length} legacy users at ${migratedAt}.`);
console.log(`Indexed ${pending.length} pending users for the expiry sweep.`);
