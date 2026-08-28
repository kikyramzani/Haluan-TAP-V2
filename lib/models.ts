// "suspended" and "super_admin" are additive: the Postgres rebuild's schema
// (prisma/schema.prisma MembershipStatus/UserRole) supports both, but the
// admin UI to set them (Phase 4's /admin/creator Suspend action and
// /admin/pengguna role management) doesn't exist yet.
export type MembershipStatus = "pending" | "verified" | "rejected" | "suspended";
export type UserRole = "creator" | "admin" | "super_admin";
/** How an account earned `emailVerifiedAt`, so grandfathered records stay auditable. */
export type VerificationSource = "code" | "google" | "migrated" | "grandfathered";

export type TapUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash?: string;
  provider: "credentials" | "google";
  emailVerifiedAt?: string;
  emailVerificationStartedAt?: string;
  verificationSource?: VerificationSource;
  /** Sessions created before this instant no longer authenticate. */
  sessionsInvalidBefore?: string;
  role: UserRole;
  membership: MembershipStatus;
  createdAt: string;
  updatedAt: string;
  tiktokUsername?: string;
  shopeeUsername?: string;
  niche?: string;
  followers?: number;
  gmv?: number;
  recipientName?: string;
  address?: string;
  assignedPic?: string;
};
