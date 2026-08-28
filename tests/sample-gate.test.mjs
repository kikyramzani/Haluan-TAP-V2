import assert from "node:assert/strict";
import test from "node:test";
import { checkSampleGate } from "../lib/sample-gate.ts";

const base = {
  profileComplete: true,
  membership: "VERIFIED",
  campaignStatus: "ACTIVE",
  campaignHasSample: true,
  sampleQuotaRemaining: null,
  alreadyRequested: false,
};

test("semua syarat terpenuhi -> diizinkan", () => {
  assert.deepEqual(checkSampleGate(base), { allowed: true });
});

test("profil belum lengkap adalah alasan pertama yang dilaporkan, mengalahkan alasan lain", () => {
  const result = checkSampleGate({ ...base, profileComplete: false, membership: "PENDING" });
  assert.deepEqual(result, { allowed: false, reason: "PROFILE_INCOMPLETE" });
});

test("belum terverifikasi ditolak walau profil lengkap", () => {
  const result = checkSampleGate({ ...base, membership: "PENDING" });
  assert.deepEqual(result, { allowed: false, reason: "NOT_VERIFIED" });
});

test("membership rejected juga ditolak sebagai NOT_VERIFIED", () => {
  const result = checkSampleGate({ ...base, membership: "REJECTED" });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "NOT_VERIFIED");
});

test("campaign yang statusnya bukan ACTIVE ditolak sebagai CAMPAIGN_INACTIVE", () => {
  const result = checkSampleGate({ ...base, campaignStatus: "ENDED" });
  assert.deepEqual(result, { allowed: false, reason: "CAMPAIGN_INACTIVE" });
});

test("campaign tanpa sample (hasSample false/null) ditolak sebagai CAMPAIGN_INACTIVE", () => {
  assert.deepEqual(checkSampleGate({ ...base, campaignHasSample: false }), { allowed: false, reason: "CAMPAIGN_INACTIVE" });
  assert.deepEqual(checkSampleGate({ ...base, campaignHasSample: null }), { allowed: false, reason: "CAMPAIGN_INACTIVE" });
});

test("campaign yang tidak ditemukan sama sekali (status null) ditolak sebagai CAMPAIGN_INACTIVE", () => {
  const result = checkSampleGate({ ...base, campaignStatus: null });
  assert.deepEqual(result, { allowed: false, reason: "CAMPAIGN_INACTIVE" });
});

test("kuota null berarti tidak dilacak, tidak pernah memblokir", () => {
  assert.deepEqual(checkSampleGate({ ...base, sampleQuotaRemaining: null }), { allowed: true });
});

test("kuota nol atau negatif memblokir sebagai NO_QUOTA", () => {
  assert.deepEqual(checkSampleGate({ ...base, sampleQuotaRemaining: 0 }), { allowed: false, reason: "NO_QUOTA" });
});

test("kuota positif tidak memblokir", () => {
  assert.deepEqual(checkSampleGate({ ...base, sampleQuotaRemaining: 3 }), { allowed: true });
});

test("sudah pernah request ditolak sebagai ALREADY_REQUESTED, hanya kalau semua syarat lain lolos", () => {
  assert.deepEqual(checkSampleGate({ ...base, alreadyRequested: true }), { allowed: false, reason: "ALREADY_REQUESTED" });
});

test("urutan pengecekan: profil > verifikasi > campaign > kuota > duplikat", () => {
  const allBad = { profileComplete: false, membership: "PENDING", campaignStatus: "ENDED", campaignHasSample: false, sampleQuotaRemaining: 0, alreadyRequested: true };
  assert.equal(checkSampleGate(allBad).reason, "PROFILE_INCOMPLETE");
});
