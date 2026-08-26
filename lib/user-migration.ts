import type { TapUser, VerificationSource } from "./models.ts";

// Proof only moves upward: an account that later completes a real challenge must
// stop being labelled as merely migrated or grandfathered.
const VERIFICATION_RANK: Record<VerificationSource, number> = { grandfathered: 1, migrated: 1, google: 2, code: 2 };

export function strongerVerification(current: VerificationSource | undefined, next: VerificationSource) {
  if (!current) return next;
  return VERIFICATION_RANK[next] >= VERIFICATION_RANK[current] ? next : current;
}

export function needsLegacyVerificationBackfill(user: TapUser) {
  return !user.emailVerifiedAt && !user.emailVerificationStartedAt;
}

export function backfillLegacyVerification(user: TapUser, migratedAt: string) {
  return needsLegacyVerificationBackfill(user)
    ? { ...user, emailVerifiedAt: migratedAt, verificationSource: "migrated" as const, updatedAt: migratedAt }
    : user;
}
