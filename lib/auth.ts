import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";
import type { TapUser, MembershipStatus, UserRole, VerificationSource } from "./models.ts";
import { hashPassword } from "./password.ts";
import { recordAudit } from "./audit.ts";
import { strongerVerification } from "./user-migration.ts";

export { hashPassword, verifyPassword } from "./password.ts";

// How long an unfinished registration may hold the address it claimed.
const PENDING_EXPIRY_MS = 60 * 60 * 1000;

const SESSION_COOKIE = "tap_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const userInclude = { creator: { include: { address: true } } } satisfies Prisma.UserInclude;
type UserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "").replace(/^0/, "62");
  return digits || null;
}
function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function adminEmails() {
  return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

/**
 * With the `@prisma/adapter-pg` driver (required by Prisma 7's client-config
 * model — see lib/db.ts), a unique-constraint P2002 does NOT carry the
 * classic `meta.target: string[]` shape; the offending index name instead
 * sits under `meta.driverAdapterError.cause.constraint.index` (e.g.
 * "User_email_key"). Both shapes are checked so this keeps working if a
 * future Prisma version restores `target`.
 */
function isUniqueConstraintError(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const meta = error.meta as Record<string, unknown> | undefined;
  if (Array.isArray(meta?.target) && (meta.target as unknown[]).includes(field)) return true;
  const driverAdapterError = meta?.driverAdapterError as { cause?: { constraint?: { index?: string } } } | undefined;
  const indexName = driverAdapterError?.cause?.constraint?.index;
  return typeof indexName === "string" && indexName.toLowerCase().includes(`_${field.toLowerCase()}_`);
}

// ---- role/membership/provider/verification-source: Prisma (UPPERCASE) <-> legacy TapUser (lowercase) ----

function roleToLegacy(role: UserRecord["role"]): UserRole {
  return role === "SUPER_ADMIN" ? "super_admin" : role === "ADMIN" ? "admin" : "creator";
}
function membershipToLegacy(membership: NonNullable<UserRecord["creator"]>["membership"]): MembershipStatus {
  return membership === "SUSPENDED" ? "suspended" : membership === "VERIFIED" ? "verified" : membership === "REJECTED" ? "rejected" : "pending";
}
function membershipToPrisma(membership: MembershipStatus) {
  return membership === "suspended" ? ("SUSPENDED" as const) : membership === "verified" ? ("VERIFIED" as const) : membership === "rejected" ? ("REJECTED" as const) : ("PENDING" as const);
}
function verificationSourceToPrisma(source: VerificationSource) {
  switch (source) {
    case "code": return "CODE" as const;
    case "google": return "GOOGLE" as const;
    case "migrated": return "MIGRATED" as const;
    case "grandfathered": return "GRANDFATHERED" as const;
  }
}
function verificationSourceToLegacy(source: UserRecord["verificationSource"]): VerificationSource | undefined {
  return source ? (source.toLowerCase() as VerificationSource) : undefined;
}

/**
 * Flattens the Prisma User+Creator(+CreatorAddress) shape into the legacy
 * TapUser shape every existing call site still expects. This is a deliberate
 * compatibility layer, not the long-term model: Phase 4/5 rebuild the admin
 * and creator UI directly against Prisma's richer shape (separate Creator
 * profile, structured CreatorAddress, CreatorCategory) and this shim goes
 * away once nothing depends on the flat fields anymore.
 */
function toTapUser(user: UserRecord): TapUser {
  const creator = user.creator;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    passwordHash: user.passwordHash ?? undefined,
    provider: user.provider === "GOOGLE" ? "google" : "credentials",
    emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
    emailVerificationStartedAt: user.emailVerificationStartedAt?.toISOString(),
    verificationSource: verificationSourceToLegacy(user.verificationSource),
    sessionsInvalidBefore: user.sessionsInvalidBefore?.toISOString(),
    role: roleToLegacy(user.role),
    membership: creator ? membershipToLegacy(creator.membership) : "pending",
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    tiktokUsername: creator?.tiktokUsername ?? undefined,
    shopeeUsername: creator?.shopeeUsername ?? undefined,
    niche: creator?.niche ?? undefined,
    followers: creator?.followers ?? undefined,
    gmv: creator?.gmv ?? undefined,
    recipientName: creator?.recipientName ?? undefined,
    address: creator?.address?.legacyAddressText ?? undefined,
    assignedPic: creator?.assignedPic ?? undefined,
  };
}

export function publicUser(user: TapUser) {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

export async function findUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, include: userInclude });
  return user ? toTapUser(user) : null;
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  return user ? toTapUser(user) : null;
}

export async function createUser(input: { name: string; email: string; phone?: string; password?: string; provider: "credentials" | "google"; requireEmailVerification?: boolean }) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone ?? "");
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const temporaryClaim = input.provider === "credentials" && input.requireEmailVerification;
  const now = new Date();
  const isAdmin = adminEmails().has(email);
  // Google is the only signup path that proves ownership at creation time;
  // credential signups become admin later, after they verify with a code.
  const grantsAdminNow = isAdmin && input.provider === "google";

  try {
    const created = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: phone ?? undefined,
        passwordHash,
        provider: input.provider === "google" ? "GOOGLE" : "CREDENTIALS",
        emailVerifiedAt: temporaryClaim ? null : now,
        emailVerificationStartedAt: temporaryClaim ? now : null,
        verificationSource: temporaryClaim ? null : verificationSourceToPrisma(input.provider === "google" ? "google" : "grandfathered"),
        role: grantsAdminNow ? "ADMIN" : "CREATOR",
        creator: { create: { membership: grantsAdminNow ? "VERIFIED" : "PENDING" } },
      },
      include: userInclude,
    });
    return toTapUser(created);
  } catch (error) {
    if (isUniqueConstraintError(error, "email")) throw new Error("EMAIL_EXISTS");
    if (isUniqueConstraintError(error, "phone")) throw new Error("PHONE_EXISTS");
    throw error;
  }
}

export async function upsertGoogleUser(input: { name: string; email: string }) {
  const email = normalizeEmail(input.email);
  const isAdmin = adminEmails().has(email);
  const existing = await prisma.user.findUnique({ where: { email }, include: userInclude });
  if (!existing) return createUser({ ...input, provider: "google" });

  const nextSource = strongerVerification(verificationSourceToLegacy(existing.verificationSource), "google");
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: existing.name || input.name,
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      verificationSource: verificationSourceToPrisma(nextSource),
      role: isAdmin ? "ADMIN" : existing.role,
      creator: existing.creator
        ? { update: { membership: isAdmin ? "VERIFIED" : existing.creator.membership } }
        : { create: { membership: isAdmin ? "VERIFIED" : "PENDING" } },
    },
    include: userInclude,
  });
  return toTapUser(updated);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(SESSION_COOKIE);
}

export type ChallengeResult =
  | { status: "committed"; user: TapUser }
  | { status: "acknowledged"; userId: string }
  | { status: "rejected" }
  /**
   * Kept in the type for the route handlers that already branch on it, but
   * this rewrite never produces it: verify/reset never change which account
   * owns an email or phone, so the conflict this described (another account
   * grabbing the address between challenge creation and commit) can no
   * longer arise structurally — Postgres's unique constraint is checked at
   * every write, not just at commit time the way the old Redis claim-keys
   * needed to be reconciled.
   */
  | { status: "claim_conflict"; claim: "email" | "phone" };

async function recentSimilarAuditExists(action: string, targetId: string, withinMs: number) {
  try {
    const since = new Date(Date.now() - withinMs);
    return Boolean(await prisma.auditLog.findFirst({ where: { action, targetId, createdAt: { gt: since } } }));
  } catch {
    return false;
  }
}

/**
 * A verify reissue that arrived with no proof of which account it belongs to.
 * Deduplicated per address for an hour so a person retrying does not bury
 * everything else in the audit trail.
 */
export async function noteVerifyPrincipalRefusal(email: string) {
  const normalised = normalizeEmail(email);
  if (await recentSimilarAuditExists("verify.principal_unproven", normalised, 3600_000)) return;
  try {
    await recordAudit({ actorId: "system:verify", action: "verify.principal_unproven", targetId: normalised, after: { reason: "no_continuation_proof", recovery: "reset" } });
  } catch { /* best-effort trail, must not block the caller */ }
}

export async function verifyEmailWithChallenge(challengeId: string, code: string): Promise<ChallengeResult> {
  if (!challengeId || !code) return { status: "rejected" };
  const codeHash = tokenHash(`${challengeId}:${code}`);
  const committed = await prisma.$transaction(async (tx) => {
    const spent = await tx.emailChallenge.updateMany({
      where: { id: challengeId, purpose: "VERIFY", codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (spent.count === 0) return null;
    const challenge = await tx.emailChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: challenge.userId! } });
    const nextSource = strongerVerification(verificationSourceToLegacy(user.verificationSource), "code");
    return tx.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date(), verificationSource: verificationSourceToPrisma(nextSource) },
      include: userInclude,
    });
  });
  if (!committed) {
    // Not spendable now — either a wrong/expired code, or one already spent by
    // an earlier request that landed. Telling those apart means a legitimate
    // retry after a lost response is acknowledged, not told its still-valid
    // code was wrong.
    const existing = await prisma.emailChallenge.findUnique({ where: { id: challengeId } });
    if (existing && existing.purpose === "VERIFY" && existing.codeHash === codeHash && existing.consumedAt) {
      return { status: "acknowledged", userId: existing.userId! };
    }
    return { status: "rejected" };
  }
  const reconciled = await reconcileAdminRole(toTapUser(committed));
  return { status: "committed", user: reconciled };
}

export async function resetPasswordWithChallenge(challengeId: string, code: string, password: string): Promise<ChallengeResult> {
  if (!challengeId || !code) return { status: "rejected" };
  const codeHash = tokenHash(`${challengeId}:${code}`);
  const passwordHash = await hashPassword(password);
  const committed = await prisma.$transaction(async (tx) => {
    const spent = await tx.emailChallenge.updateMany({
      where: { id: challengeId, purpose: "RESET", codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (spent.count === 0) return null;
    const challenge = await tx.emailChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: challenge.userId! } });
    const nextSource = strongerVerification(verificationSourceToLegacy(user.verificationSource), "code");
    return tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        verificationSource: verificationSourceToPrisma(nextSource),
        // Old sessions stop authenticating the instant this lands (getCurrentUser
        // checks the session's createdAt against this cutoff) — nothing has to
        // be deleted before the commit for the change to be safe.
        sessionsInvalidBefore: new Date(),
      },
      include: userInclude,
    });
  });
  if (!committed) {
    const existing = await prisma.emailChallenge.findUnique({ where: { id: challengeId } });
    if (existing && existing.purpose === "RESET" && existing.codeHash === codeHash && existing.consumedAt) {
      return { status: "acknowledged", userId: existing.userId! };
    }
    return { status: "rejected" };
  }
  return { status: "committed", user: toTapUser(committed) };
}

export async function deletePendingUser(userId: string) {
  const result = await prisma.user.deleteMany({ where: { id: userId, emailVerifiedAt: null, NOT: { emailVerificationStartedAt: null } } });
  return result.count > 0;
}

export async function cleanupExpiredPendingUsers(olderThan = Date.now() - PENDING_EXPIRY_MS) {
  const result = await prisma.user.deleteMany({ where: { emailVerifiedAt: null, emailVerificationStartedAt: { lt: new Date(olderThan) } } });
  return result.count;
}

export async function getCurrentUser(): Promise<TapUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, include: userInclude });
  if (!user) return null;
  // A password reset or an access revocation stamps a cut-off on the record, so
  // sessions issued earlier stop authenticating even before their rows are swept.
  if (user.sessionsInvalidBefore && session.createdAt < user.sessionsInvalidBefore) return null;
  return toTapUser(user);
}

export async function requireUser(returnTo = "/dashboard") {
  let user = null;
  try { user = await getCurrentUser(); }
  catch { redirect(`/daftar?error=system_unavailable&returnTo=${encodeURIComponent(returnTo)}`); }
  if (!user) redirect(`/daftar?mode=login&returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}

export function allowlistedAdmin(email: string) {
  return adminEmails().has(normalizeEmail(email));
}

/**
 * The allowlist names an address; it cannot prove that the person holding the
 * account owns that address. Granting therefore also requires the account to
 * have proven the email itself, through a one-time code or Google sign-in.
 */
export function provenEmailOwnership(user: TapUser) {
  return Boolean(user.emailVerifiedAt) && (user.verificationSource === "code" || user.verificationSource === "google");
}

async function auditAdminDecision(action: string, user: TapUser, after: Record<string, unknown>) {
  try {
    await recordAudit({ actorId: "system:allowlist", action, targetId: user.id, before: { role: user.role, verificationSource: user.verificationSource ?? null }, after });
  } catch { /* the access decision has already been applied; the trail must not undo it */ }
}

/**
 * The allowlist is the authority on the ADMIN tier specifically, re-evaluated
 * on every admin request rather than only at account creation. A SUPER_ADMIN
 * is a manual promotion (via the Phase 4 /admin/pengguna screen), not derived
 * from ADMIN_EMAILS, so it is never touched here in either direction.
 */
export async function reconcileAdminRole(user: TapUser): Promise<TapUser> {
  if (user.role === "super_admin") return user;
  const allowlisted = allowlistedAdmin(user.email);
  const isAdmin = user.role === "admin";
  if (allowlisted === isAdmin) return user;

  if (!allowlisted) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: "CREATOR", sessionsInvalidBefore: new Date() },
      include: userInclude,
    });
    await auditAdminDecision("admin.revoked", user, { role: "creator", sessionsRevoked: true, reason: "allowlist_removed" });
    return toTapUser(updated);
  }

  if (!provenEmailOwnership(user)) {
    if (!(await recentSimilarAuditExists("admin.grant_blocked", user.id, 3600_000))) {
      await auditAdminDecision("admin.grant_blocked", user, { role: user.role, reason: "email_ownership_unproven" });
    }
    return user;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN", creator: { upsert: { create: { membership: "VERIFIED" }, update: { membership: "VERIFIED" } } } },
    include: userInclude,
  });
  await auditAdminDecision("admin.granted", user, { role: "admin", verificationSource: user.verificationSource ?? null });
  return toTapUser(updated);
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  const reconciled = await reconcileAdminRole(user);
  return reconciled.role === "admin" || reconciled.role === "super_admin" ? reconciled : null;
}

export async function requireAdmin() {
  // Jalur masuknya sengaja terpisah dari requireUser()/creator: pengunjung yang
  // belum login harus mendarat di /admin/login, bukan di /daftar yang naskahnya
  // ditulis untuk pendaftaran creator.
  let user = null;
  try { user = await getCurrentUser(); }
  catch { redirect("/admin/login?error=system_unavailable"); }
  if (!user) redirect("/admin/login");
  const reconciled = await reconcileAdminRole(user);
  if (reconciled.role !== "admin" && reconciled.role !== "super_admin") redirect("/dashboard?error=forbidden");
  return reconciled;
}

export async function listUsers(input: { offset?: number; limit?: number; q?: string; role?: TapUser["role"] } = {}) {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = (input.q ?? "").trim();
  const roleFilter = input.role ? (input.role === "super_admin" ? ("SUPER_ADMIN" as const) : input.role === "admin" ? ("ADMIN" as const) : ("CREATOR" as const)) : undefined;
  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { creator: { tiktokUsername: { contains: q, mode: "insensitive" } } },
            { creator: { shopeeUsername: { contains: q, mode: "insensitive" } } },
            { creator: { recipientName: { contains: q, mode: "insensitive" } } },
            { creator: { assignedPic: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, include: userInclude, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map(toTapUser), total };
}

export async function updateMembership(userId: string, membership: MembershipStatus) {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { creator: { upsert: { create: { membership: membershipToPrisma(membership) }, update: { membership: membershipToPrisma(membership) } } } },
      include: userInclude,
    });
    return toTapUser(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new Error("USER_NOT_FOUND");
    throw error;
  }
}

export async function updateProfile(userId: string, input: Partial<Pick<TapUser, "name" | "phone" | "tiktokUsername" | "shopeeUsername" | "niche" | "followers" | "gmv" | "recipientName" | "address" | "assignedPic">>) {
  const nextPhone = input.phone === undefined ? undefined : normalizePhone(input.phone);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: userId }, include: userInclude });
      if (!existing) throw new Error("USER_NOT_FOUND");

      // Untyped on purpose: the same plain-scalar object is passed to both the
      // `create` and `update` branches of the upsert below, which expect two
      // different (but scalar-compatible) Prisma input types.
      const creatorData: { tiktokUsername?: string; shopeeUsername?: string; niche?: string; followers?: number; gmv?: number; recipientName?: string; assignedPic?: string } = {};
      if (input.tiktokUsername !== undefined) creatorData.tiktokUsername = input.tiktokUsername;
      if (input.shopeeUsername !== undefined) creatorData.shopeeUsername = input.shopeeUsername;
      if (input.niche !== undefined) creatorData.niche = input.niche;
      if (input.followers !== undefined) creatorData.followers = input.followers;
      if (input.gmv !== undefined) creatorData.gmv = input.gmv;
      if (input.recipientName !== undefined) creatorData.recipientName = input.recipientName;
      if (input.assignedPic !== undefined) creatorData.assignedPic = input.assignedPic;

      const result = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
          creator: { upsert: { create: creatorData, update: creatorData } },
        },
        include: userInclude,
      });

      if (input.address !== undefined) {
        await tx.creatorAddress.upsert({
          where: { creatorId: result.creator!.id },
          create: { creatorId: result.creator!.id, legacyAddressText: input.address },
          update: { legacyAddressText: input.address },
        });
      }

      return tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
    });
    return toTapUser(updated);
  } catch (error) {
    if (isUniqueConstraintError(error, "phone")) throw new Error("PHONE_EXISTS");
    throw error;
  }
}
