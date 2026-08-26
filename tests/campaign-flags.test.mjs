import assert from "node:assert/strict";
import test from "node:test";
import { classifyExpiry, expiryLabel, isActionable, isPromotable, ENDING_SOON_DAYS } from "../lib/campaign-flags.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed instants, chosen so Jakarta (UTC+7) and UTC disagree about what day it is:
// 18:00 UTC is already tomorrow in Jakarta. If the implementation ever slips back to
// browser-local or UTC arithmetic, these dates go off by one and the suite goes red.
const EVENING_UTC = new Date("2026-08-18T18:00:00Z"); // 19 Agustus 01:00 WIB
const MORNING_UTC = new Date("2026-08-18T04:00:00Z"); // 18 Agustus 11:00 WIB

test("hitungan kedaluwarsa memakai hari Jakarta, bukan hari UTC", () => {
  // At 18:00 UTC it is still the 18th in UTC but the 19th in Jakarta, so a campaign
  // ending 18/08 has already ended for the people it is sold to.
  assert.deepEqual(classifyExpiry("18/08/2026", EVENING_UTC), { kind: "expired", daysAgo: 1 });
  assert.deepEqual(classifyExpiry("18/08/2026", MORNING_UTC), { kind: "ending", daysLeft: 0 });
});

test("batas akhir inklusif dan berjenjang", () => {
  assert.deepEqual(classifyExpiry("19/08/2026", EVENING_UTC), { kind: "ending", daysLeft: 0 });
  assert.deepEqual(classifyExpiry("20/08/2026", EVENING_UTC), { kind: "ending", daysLeft: 1 });
  const horizon = new Date(Date.UTC(2026, 7, 19) + ENDING_SOON_DAYS * DAY_MS);
  const format = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  assert.equal(classifyExpiry(format(horizon), EVENING_UTC).kind, "ending", "hari ke-14 masih dihitung ending");
  const beyond = new Date(horizon.getTime() + DAY_MS);
  assert.equal(classifyExpiry(format(beyond), EVENING_UTC).kind, "active", "hari ke-15 bukan lagi ending");
});

test("tanggal yang tidak bisa dipercaya dilaporkan, bukan disembunyikan", () => {
  // Absent is a different fact from unreadable, and the product treats them
  // differently: no badge versus a data-quality flag.
  for (const absent of [null, undefined, "", "   "]) {
    assert.deepEqual(classifyExpiry(absent, EVENING_UTC), { kind: "none" }, `${JSON.stringify(absent)} berarti tidak ada tanggal`);
  }
  for (const invalid of ["31/02/2026", "31/13/2026", "00/01/2026", "2026-12-31", "besok", "1/1/2026", "31 Des 2026"]) {
    const state = classifyExpiry(invalid, EVENING_UTC);
    assert.equal(state.kind, "unverified", `${invalid} harus unverified`);
    assert.equal(state.raw, invalid.trim());
    assert.equal(expiryLabel(state), "Tanggal perlu verifikasi");
  }
});

test("label mengikuti keadaan dan hanya keadaan", () => {
  assert.equal(expiryLabel({ kind: "ending", daysLeft: 0 }), "Berakhir hari ini");
  assert.equal(expiryLabel({ kind: "ending", daysLeft: 1 }), "Berakhir besok");
  assert.equal(expiryLabel({ kind: "ending", daysLeft: 7 }), "Berakhir 7 hari lagi");
  assert.equal(expiryLabel({ kind: "expired", daysAgo: 3 }), "Sudah berakhir");
  assert.equal(expiryLabel({ kind: "none" }), null);
  assert.equal(expiryLabel({ kind: "active", daysLeft: 90 }), null);
});

test("badge benefit hanya muncul pada campaign yang masih hidup", () => {
  // Kedaluwarsa mengalahkan promosi: kartu tidak boleh menjanjikan benefit
  // sekaligus mengakui campaign-nya sudah selesai.
  assert.equal(isPromotable({ kind: "active", daysLeft: 30 }), true);
  assert.equal(isPromotable({ kind: "ending", daysLeft: 2 }), true, "ending masih hidup, badge tetap sah");
  assert.equal(isPromotable({ kind: "none" }), true, "tanpa tanggal berarti tidak ada bukti campaign berakhir");
  assert.equal(isPromotable({ kind: "expired", daysAgo: 1 }), false);
  // Tanggal yang tidak terbaca bukan bukti campaign masih jalan.
  assert.equal(isPromotable({ kind: "unverified", raw: "31/02/2026" }), false);
});

test("campaign kedaluwarsa bukan penawaran", () => {
  assert.equal(isActionable({ kind: "expired", daysAgo: 1 }), false);
  for (const alive of [{ kind: "none" }, { kind: "active", daysLeft: 20 }, { kind: "ending", daysLeft: 0 }, { kind: "unverified", raw: "x" }]) {
    assert.equal(isActionable(alive), true);
  }
});
