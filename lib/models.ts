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
  /**
   * Alamat kirim per BAGIAN, bukan satu blob teks.
   *
   * `address` di atas adalah `legacyAddressText` — satu string hasil migrasi
   * yang tidak bisa dipecah kembali jadi kelurahan/kecamatan/kabupaten. Form
   * request sample punya tujuh field terpisah, jadi ia butuh bentuk ini kalau
   * ingin terisi otomatis dari profil yang sudah dilengkapi creator.
   *
   * Nama wilayah, bukan id: field di form adalah teks bebas yang dibaca
   * manusia, dan id BPS tidak berarti apa-apa di sana.
   */
  shipping?: {
    street?: string;
    rt?: string;
    rw?: string;
    village?: string;
    district?: string;
    regency?: string;
    province?: string;
    postalCode?: string;
    recipientPhone?: string;
  };
};
