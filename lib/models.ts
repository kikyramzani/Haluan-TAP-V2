export type MembershipStatus = "pending" | "verified" | "rejected";
export type UserRole = "creator" | "admin";
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

export type SampleStatus = "submitted" | "review" | "approved" | "rejected" | "on_hold" | "shipped" | "received" | "content_submitted";

export type SampleRequest = {
  id: string;
  userId: string;
  brand: string;
  platform: string;
  username: string;
  profileUrl: string;
  recipientName: string;
  phone: string;
  address: string;
  commitment: boolean;
  sow?: "VT" | "Live" | "Live + VT";
  followers?: number;
  gmv?: number;
  preferredSample?: string;
  picName?: string;
  picPhone?: string;
  requestGroupId?: string;
  status: SampleStatus;
  trackingNumber?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClickEvent = {
  id: string;
  userId: string;
  campaignId: string;
  createdAt: string;
  referrer?: string;
  userAgent?: string;
};
