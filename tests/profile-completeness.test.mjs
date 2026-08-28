import assert from "node:assert/strict";
import test from "node:test";
import { computeProfileCompleteness } from "../lib/profile-completeness.ts";

const complete = {
  name: "Budi",
  phone: "6281234567890",
  provinceId: "p1",
  regencyId: "r1",
  districtId: "d1",
  villageId: "v1",
  detailAddress: "Jl. Contoh No. 1",
  postalCode: "12345",
  recipientPhone: "6281234567890",
};

test("profil lengkap menghasilkan 100% dan tanpa field hilang", () => {
  const result = computeProfileCompleteness(complete);
  assert.equal(result.percent, 100);
  assert.equal(result.complete, true);
  assert.deepEqual(result.missingFields, []);
});

test("field kosong (string) dihitung sebagai belum lengkap, bukan hanya null/undefined", () => {
  const result = computeProfileCompleteness({ ...complete, detailAddress: "   " });
  assert.equal(result.complete, false);
  assert.ok(result.missingFields.includes("Alamat lengkap"));
});

test("profil kosong sama sekali menghasilkan 0%", () => {
  const result = computeProfileCompleteness({
    name: null,
    phone: null,
    provinceId: null,
    regencyId: null,
    districtId: null,
    villageId: null,
    detailAddress: null,
    postalCode: null,
    recipientPhone: null,
  });
  assert.equal(result.percent, 0);
  assert.equal(result.missingFields.length, 9);
});

test("hanya wilayah yang belum diisi tetap dilaporkan satu-satu, bukan digabung", () => {
  const result = computeProfileCompleteness({ ...complete, regencyId: null, villageId: null });
  assert.deepEqual(result.missingFields, ["Kabupaten/Kota", "Kelurahan/Desa"]);
  assert.equal(result.percent, Math.round((7 / 9) * 100));
});
