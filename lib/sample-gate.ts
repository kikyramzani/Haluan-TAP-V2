/**
 * The 5 typed reasons a sample request can be blocked, checked in order,
 * the first one that applies is the one reported. Pure function (no I/O) so
 * it can be unit-tested against fixtures independent of Prisma/Next.js; the
 * caller is responsible for gathering the inputs (profile completeness,
 * membership, campaign state, quota, prior-request check).
 */

export type SampleGateReason = "PROFILE_INCOMPLETE" | "NOT_VERIFIED" | "CAMPAIGN_INACTIVE" | "NO_QUOTA" | "ALREADY_REQUESTED";

export type SampleGateResult = { allowed: true } | { allowed: false; reason: SampleGateReason };

export const SAMPLE_GATE_MESSAGES: Record<SampleGateReason, string> = {
  PROFILE_INCOMPLETE: "Lengkapi profil dan alamat pengiriman dulu sebelum request sample.",
  NOT_VERIFIED: "Akun kamu masih menunggu verifikasi tim Haluan sebelum bisa request sample.",
  CAMPAIGN_INACTIVE: "Campaign ini sedang tidak membuka sample.",
  NO_QUOTA: "Kuota sample untuk campaign ini sudah habis.",
  ALREADY_REQUESTED: "Kamu sudah mengajukan sample untuk campaign ini.",
};

export type SampleGateInput = {
  profileComplete: boolean;
  membership: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  /** null when no campaign could be resolved at all (treated the same as inactive). */
  campaignStatus: "ACTIVE" | "ENDED" | "HIDDEN" | null;
  campaignHasSample: boolean | null;
  /** null = quota not tracked for this campaign (never blocks). */
  sampleQuotaRemaining: number | null;
  alreadyRequested: boolean;
};

export function checkSampleGate(input: SampleGateInput): SampleGateResult {
  if (!input.profileComplete) return { allowed: false, reason: "PROFILE_INCOMPLETE" };
  if (input.membership !== "VERIFIED") return { allowed: false, reason: "NOT_VERIFIED" };
  if (input.campaignStatus !== "ACTIVE" || !input.campaignHasSample) return { allowed: false, reason: "CAMPAIGN_INACTIVE" };
  if (input.sampleQuotaRemaining !== null && input.sampleQuotaRemaining <= 0) return { allowed: false, reason: "NO_QUOTA" };
  if (input.alreadyRequested) return { allowed: false, reason: "ALREADY_REQUESTED" };
  return { allowed: true };
}
