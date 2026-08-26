/**
 * Deciding who legitimately holds admin, separated from reading the datastore.
 *
 * The counts are the point: a verdict of "safe" has to mean every way an account
 * can hold admin without owning the address that granted it is zero. Keeping this
 * pure is what lets the A/B case — two records carrying one allowlisted address,
 * the index naming one and admin sitting on the other — be tested without a live
 * datastore.
 */
export type AuditUser = {
  id: string;
  email?: string;
  role?: string;
  provider?: string;
  emailVerifiedAt?: string;
  verificationSource?: string;
  /** Present in `tap:v1:users`. A record that fell out still authenticates. */
  indexed: boolean;
};

/** What the email index says about one address, plus how long it lives. */
export type ClaimState = {
  holderId: string | null;
  /** Redis TTL semantics: -1 means no expiry, -2 means the key is gone. */
  ttl: number;
};

export type AdminAuditInput = {
  allowlist: string[];
  users: AuditUser[];
  claims: Record<string, ClaimState>;
};

export type AdminAuditReport = {
  users: number;
  admins: AuditUser[];
  unprovenAdmins: AuditUser[];
  /**
   * Allowlisted addresses nobody holds at all: the next signup takes them, and
   * on a deployment that grants admin by allowlist match, becomes admin.
   */
  openSlots: string[];
  /**
   * Allowlisted addresses whose index points at something inconsistent — a record
   * that is gone, or one whose own email says otherwise. These still block a
   * signup, so calling them "open" would misdescribe what an operator has to do:
   * the claim needs repairing, not just registering.
   */
  brokenClaims: Array<{ address: string; why: string; holderId: string | null }>;
  /** Admin roles the allowlist no longer names. */
  orphanAdmins: AuditUser[];
  /** Admins whose address is held by a different account — or by nobody. */
  adminIndexMismatches: Array<{ id: string; address: string; holderId: string | null }>;
  /** More than one record carrying the same allowlisted address. */
  duplicateRecords: Array<{ address: string; ids: string[] }>;
  /** Claims that can expire and hand the address to the next signup. */
  impermanentClaims: Array<{ address: string; ttl: number }>;
  /** Records missing from `tap:v1:users`. */
  unindexed: AuditUser[];
  safe: boolean;
};

export function normalizeAddress(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function provenOwnership(user: AuditUser) {
  return Boolean(user.emailVerifiedAt) && (user.verificationSource === "code" || user.verificationSource === "google");
}

export function auditAdmins(input: AdminAuditInput): AdminAuditReport {
  const allowlist = input.allowlist.map(normalizeAddress).filter(Boolean);
  const claimFor = (address: string) => input.claims[address] ?? { holderId: null, ttl: -2 };
  const admins = input.users.filter((user) => user.role === "admin");

  const openSlots: AdminAuditReport["openSlots"] = [];
  const brokenClaims: AdminAuditReport["brokenClaims"] = [];
  const duplicateRecords: AdminAuditReport["duplicateRecords"] = [];
  const impermanentClaims: AdminAuditReport["impermanentClaims"] = [];
  for (const address of allowlist) {
    const claim = claimFor(address);
    const holder = claim.holderId ? input.users.find((user) => user.id === claim.holderId) : undefined;
    if (!claim.holderId) openSlots.push(address);
    else if (!holder) brokenClaims.push({ address, why: "index menunjuk record yang tidak ada", holderId: claim.holderId });
    else if (normalizeAddress(holder.email) !== address) brokenClaims.push({ address, why: "record pemegang index memakai email lain", holderId: claim.holderId });

    // A second record carrying the same address is how an account can look
    // entitled while the index names somebody else entirely.
    const carriers = input.users.filter((user) => normalizeAddress(user.email) === address).map((user) => user.id);
    if (carriers.length > 1) duplicateRecords.push({ address, ids: carriers });

    // A claim that can expire re-opens the slot the moment it does.
    if (claim.holderId && claim.ttl !== -1) impermanentClaims.push({ address, ttl: claim.ttl });
  }

  const adminIndexMismatches = admins
    .map((admin) => ({ id: admin.id, address: normalizeAddress(admin.email), holderId: claimFor(normalizeAddress(admin.email)).holderId }))
    .filter((entry) => entry.holderId !== entry.id);

  const report: AdminAuditReport = {
    users: input.users.length,
    admins,
    unprovenAdmins: admins.filter((admin) => !provenOwnership(admin)),
    openSlots,
    brokenClaims,
    orphanAdmins: admins.filter((admin) => !allowlist.includes(normalizeAddress(admin.email))),
    adminIndexMismatches,
    duplicateRecords,
    impermanentClaims,
    unindexed: input.users.filter((user) => !user.indexed),
    safe: false,
  };
  report.safe = report.unprovenAdmins.length === 0
    && report.openSlots.length === 0
    && report.brokenClaims.length === 0
    && report.orphanAdmins.length === 0
    && report.adminIndexMismatches.length === 0
    && report.duplicateRecords.length === 0
    && report.impermanentClaims.length === 0
    && report.unindexed.length === 0;
  return report;
}
