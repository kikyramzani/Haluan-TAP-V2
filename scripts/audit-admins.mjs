import { readFileSync } from "node:fs";
import { auditAdmins, normalizeAddress } from "../lib/admin-audit.ts";

/**
 * Who legitimately holds admin on a deployed environment?
 *
 * The allowlist names an address; it cannot show that the account holding admin
 * is the one that owns it. This reads the datastore directly, so the answer does
 * not depend on the deployed code being the version that re-checks anything.
 *
 * It requires KV_REST_API_READ_ONLY_TOKEN and never falls back to the
 * application's read-write token variable. What that token is actually scoped
 * to is the datastore's setting, not something this script can vouch for. Run it
 * before adding an admin address, after any deploy that touches the admin model,
 * and as the first step of any incident involving admin access.
 *
 *   node scripts/audit-admins.mjs [--env .env.production.local] [--mask]
 */
const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.production.local";
const mask = args.includes("--mask");

const env = Object.fromEntries(readFileSync(envFile, "utf8")
  .split("\n")
  .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^"|"$/g, "")];
  }));

const url = env.KV_REST_API_URL;
const token = env.KV_REST_API_READ_ONLY_TOKEN;
if (!url || !token) {
  console.error(`${envFile} harus memuat KV_REST_API_URL dan KV_REST_API_READ_ONLY_TOKEN.`);
  console.error("Audit ini tidak membaca token read-write: audit tidak boleh bisa mengubah yang diukurnya.");
  process.exit(2);
}

const show = (address) => (mask ? String(address).replace(/^(.).*(@.*)$/, "$1***$2") : address);

async function call(...command) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

/**
 * The membership index is how the application lists users, which is exactly why
 * it cannot be the only place an audit looks: a record that fell out of it still
 * authenticates and still carries its role.
 */
async function readAllUsers() {
  const keys = new Set();
  let cursor = "0";
  do {
    const [next, batch] = await call("SCAN", cursor, "MATCH", "tap:v1:user:*", "COUNT", 500);
    cursor = String(next);
    // Sessions and phone intents live under longer paths; the record is `user:{id}`.
    for (const storageKey of batch ?? []) if (/^tap:v1:user:[^:]+$/.test(storageKey)) keys.add(storageKey);
  } while (cursor !== "0");
  const indexed = new Set(((await call("ZREVRANGE", "tap:v1:users", 0, -1)) ?? []).map((id) => `tap:v1:user:${id}`));
  for (const storageKey of indexed) keys.add(storageKey);
  const ordered = [...keys];
  const records = ordered.length ? ((await call("MGET", ...ordered)) ?? []) : [];
  return records
    .map((raw, position) => (raw ? { ...JSON.parse(raw), indexed: indexed.has(ordered[position]) } : null))
    .filter(Boolean);
}

const allowlist = (env.ADMIN_EMAILS ?? "").split(",").map(normalizeAddress).filter(Boolean);
const users = await readAllUsers();

// Every address that could decide an admin question: the allowlist itself, plus
// whatever address each admin record claims.
const addresses = new Set([...allowlist, ...users.filter((user) => user.role === "admin").map((user) => normalizeAddress(user.email))]);
const claims = {};
for (const address of addresses) {
  if (!address) continue;
  const [holderId, ttl] = await Promise.all([call("GET", `tap:v1:email:${address}`), call("TTL", `tap:v1:email:${address}`)]);
  claims[address] = { holderId: holderId ?? null, ttl: Number(ttl ?? -2) };
}

const report = auditAdmins({ allowlist, users, claims });

console.log(`env: ${envFile} · token: read-only`);
console.log(`user: ${report.users}${report.unindexed.length ? ` (${report.unindexed.length} di luar tap:v1:users)` : ""} · alamat di ADMIN_EMAILS: ${allowlist.length}`);

console.log(`\nakun dengan role admin: ${report.admins.length}`);
for (const admin of report.admins) {
  const mismatch = report.adminIndexMismatches.find((entry) => entry.id === admin.id);
  console.log(`  ${show(admin.email)} · provider=${admin.provider} · verificationSource=${admin.verificationSource ?? "(tidak ada)"} · kepemilikan terbukti=${report.unprovenAdmins.includes(admin) ? "TIDAK" : "ya"} · memegang index email=${mismatch ? "TIDAK" : "ya"}`);
}

console.log(`\nunprovenAdmins: ${report.unprovenAdmins.length}`);
console.log(`adminIndexMismatches: ${report.adminIndexMismatches.length}`);
for (const entry of report.adminIndexMismatches) {
  console.log(`  ${show(entry.address)} — role admin di ${entry.id}, index menunjuk ${entry.holderId ?? "(kosong)"}`);
}
console.log(`slot admin terbuka (tidak dipegang siapa pun, siap diklaim pendaftar): ${report.openSlots.length}`);
for (const address of report.openSlots) console.log(`  ${show(address)}`);
console.log(`klaim rusak (memblokir signup, tetapi tidak konsisten): ${report.brokenClaims.length}`);
for (const broken of report.brokenClaims) console.log(`  ${show(broken.address)} — ${broken.why} (${broken.holderId})`);
console.log(`record ganda untuk alamat allowlist: ${report.duplicateRecords.length}`);
for (const duplicate of report.duplicateRecords) console.log(`  ${show(duplicate.address)} — ${duplicate.ids.join(", ")}`);
console.log(`klaim yang masih bisa kedaluwarsa: ${report.impermanentClaims.length}`);
for (const claim of report.impermanentClaims) console.log(`  ${show(claim.address)} — TTL ${claim.ttl}s`);
if (report.orphanAdmins.length) {
  console.log(`\nrole admin tanpa dukungan allowlist: ${report.orphanAdmins.length}`);
  console.log("  Deployment yang mengevaluasi ulang allowlist akan mencabutnya pada request admin berikutnya.");
}

console.log(`\n${report.safe ? "AMAN" : "PERLU TINDAKAN"}: unproven=${report.unprovenAdmins.length} · mismatch=${report.adminIndexMismatches.length} · slot=${report.openSlots.length} · klaim rusak=${report.brokenClaims.length} · ganda=${report.duplicateRecords.length} · klaim fana=${report.impermanentClaims.length} · tanpa allowlist=${report.orphanAdmins.length} · di luar index=${report.unindexed.length}`);
process.exitCode = report.safe ? 0 : 1;
