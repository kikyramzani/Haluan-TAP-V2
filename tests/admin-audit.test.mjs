import assert from "node:assert/strict";
import test from "node:test";
import { auditAdmins } from "../lib/admin-audit.ts";

const now = "2026-01-01T00:00:00.000Z";
const account = (overrides) => ({ id: "a", email: "admin@tap.test", role: "creator", provider: "credentials", emailVerifiedAt: now, verificationSource: "code", indexed: true, ...overrides });
const permanent = (holderId) => ({ holderId, ttl: -1 });

test("akun admin yang memegang klaim permanen atas alamat allowlist dianggap aman", () => {
  const report = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ role: "admin" })],
    claims: { "admin@tap.test": permanent("a") },
  });
  assert.equal(report.safe, true);
  assert.deepEqual([report.unprovenAdmins.length, report.openSlots.length, report.adminIndexMismatches.length], [0, 0, 0]);
});

test("admin yang alamatnya dipegang akun lain tidak pernah dianggap aman", () => {
  // The case the earlier audit missed: both records carry the allowlisted
  // address, the index names B, and admin sits on A. Every count that only looked
  // at "does some record with this email hold the index" read as clean.
  const report = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ id: "a", role: "admin" }), account({ id: "b", role: "creator" })],
    claims: { "admin@tap.test": permanent("b") },
  });
  assert.equal(report.safe, false);
  assert.equal(report.openSlots.length, 0, "index memang dipegang record dengan email yang cocok");
  assert.equal(report.brokenClaims.length, 0, "dan klaimnya juga tidak rusak");
  assert.deepEqual(report.adminIndexMismatches, [{ id: "a", address: "admin@tap.test", holderId: "b" }]);
  assert.deepEqual(report.duplicateRecords, [{ address: "admin@tap.test", ids: ["a", "b"] }]);
});

test("alamat yang tidak dipegang siapa pun dilaporkan sebagai slot terbuka", () => {
  // Nobody holds it, so the next signup takes it. The case an operator closes by
  // registering or removing the address.
  const empty = auditAdmins({ allowlist: ["admin@tap.test"], users: [], claims: {} });
  assert.deepEqual(empty.openSlots, ["admin@tap.test"]);
  assert.equal(empty.brokenClaims.length, 0);
  assert.equal(empty.safe, false);
});

test("klaim yang rusak dipisahkan dari slot terbuka karena tetap memblokir signup", () => {
  // These still fail a `SET NX`, so calling them open would tell an operator to do
  // the wrong thing: the claim needs repairing, not registering.
  const dangling = auditAdmins({ allowlist: ["admin@tap.test"], users: [], claims: { "admin@tap.test": permanent("hilang") } });
  assert.deepEqual(dangling.openSlots, []);
  assert.equal(dangling.brokenClaims[0].why, "index menunjuk record yang tidak ada");
  assert.equal(dangling.brokenClaims[0].holderId, "hilang");

  const mismatched = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ id: "b", email: "lain@tap.test" })],
    claims: { "admin@tap.test": permanent("b") },
  });
  assert.deepEqual(mismatched.openSlots, []);
  assert.equal(mismatched.brokenClaims[0].why, "record pemegang index memakai email lain");
  for (const report of [dangling, mismatched]) assert.equal(report.safe, false);
});

test("klaim yang masih punya TTL dilaporkan karena slotnya terbuka kembali saat kedaluwarsa", () => {
  const report = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ role: "admin" })],
    claims: { "admin@tap.test": { holderId: "a", ttl: 1800 } },
  });
  assert.deepEqual(report.impermanentClaims, [{ address: "admin@tap.test", ttl: 1800 }]);
  assert.equal(report.safe, false);
});

test("admin tanpa bukti kepemilikan dan admin di luar allowlist dihitung terpisah", () => {
  const unproven = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ role: "admin", verificationSource: "grandfathered" })],
    claims: { "admin@tap.test": permanent("a") },
  });
  assert.equal(unproven.unprovenAdmins.length, 1);
  assert.equal(unproven.orphanAdmins.length, 0);

  const orphan = auditAdmins({
    allowlist: ["lain@tap.test"],
    users: [account({ role: "admin" })],
    claims: { "admin@tap.test": permanent("a"), "lain@tap.test": permanent("a") },
  });
  assert.equal(orphan.orphanAdmins.length, 1);
  for (const report of [unproven, orphan]) assert.equal(report.safe, false);
});

test("record yang terlepas dari index keanggotaan tetap terhitung", () => {
  const report = auditAdmins({
    allowlist: ["admin@tap.test"],
    users: [account({ role: "admin", indexed: false })],
    claims: { "admin@tap.test": permanent("a") },
  });
  assert.equal(report.users, 1);
  assert.equal(report.unindexed.length, 1);
  assert.equal(report.safe, false);
});

test("alamat allowlist dibandingkan setelah dinormalisasi", () => {
  const report = auditAdmins({
    allowlist: ["  Admin@Tap.Test  "],
    users: [account({ email: "ADMIN@tap.test", role: "admin" })],
    claims: { "admin@tap.test": permanent("a") },
  });
  assert.equal(report.safe, true);
});
