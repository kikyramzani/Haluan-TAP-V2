import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getJson, getJsonMany, key, redis, setJson } from "./redis.ts";
import type { TapUser } from "./models.ts";
import { hashPassword } from "./password.ts";
import { bumpCollectionRevision, createFilterCache, currentCollectionRevision } from "./filter-cache.ts";
import { recordAudit } from "./audit.ts";
import { strongerVerification } from "./user-migration.ts";
import { isMutationConflict, MutationConflictError, withRecordLock } from "./mutation.ts";
import { commitWithChallenge, deleteIfEquals } from "./atomic.ts";
import { CHALLENGE_RECEIPT_TTL_SECONDS, challengeGuardKey, challengeGuardValue, challengeReceiptKey, challengeReceiptValue, discardEmailChallenge, peekEmailChallenge, readChallengeReceipt, releaseEmailSend, type EmailAuthPurpose } from "./email-auth.ts";

export { hashPassword, verifyPassword } from "./password.ts";

// How long an unfinished registration may hold the address it claimed.
const PENDING_EXPIRY_MS = 60 * 60 * 1000;

const SESSION_COOKIE = "tap_session";
const SESSION_TTL = 60 * 60 * 24 * 30;
const userFilterCache = createFilterCache<TapUser[]>();

async function bumpUserRevision() {
  userFilterCache.clear();
  await bumpCollectionRevision("users");
}

function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function normalizePhone(value: string) { return value.replace(/\D/g, "").replace(/^0/, "62"); }
function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function adminEmails() { return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean)); }

export function publicUser(user: TapUser) {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

export async function findUserByEmail(email: string) {
  const id = await redis<string | null>("GET", key("email", normalizeEmail(email)));
  return id ? getJson<TapUser>(key("user", id)) : null;
}

/**
 * A registration claim is only released when its record is deleted, so an
 * abandoned signup would otherwise hold an address until the nightly sweep. The
 * next person who wants that address triggers the cleanup instead of waiting for
 * it: the holder is only dropped if it is a pending record already past its
 * window, which is exactly what the sweep would have done.
 */
async function releaseAbandonedClaim(storageKey: string) {
  const holderId = await redis<string | null>("GET", storageKey);
  if (!holderId) return false;
  const holder = await getJson<TapUser>(key("user", holderId));
  if (!holder) {
    // The record is gone; the claim is an orphan and safe to drop.
    return deleteIfEquals(storageKey, holderId);
  }
  if (holder.emailVerifiedAt || !holder.emailVerificationStartedAt) return false;
  if (Date.parse(holder.emailVerificationStartedAt) > Date.now() - PENDING_EXPIRY_MS) return false;
  return deletePendingUser(holderId);
}

export async function createUser(input: { name: string; email: string; phone?: string; password?: string; provider: "credentials" | "google"; requireEmailVerification?: boolean }) {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone ?? "");
  const id = randomUUID();
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const temporaryClaim = input.provider === "credentials" && input.requireEmailVerification;
  // No expiry on either claim. A claim that outlives its record is released by
  // the cleanup that deletes the record; a claim that dies before its record
  // opens a slot for a second pending account on the same address, and then the
  // index no longer tells you whose account it is.
  const claimArgs: Array<string | number> = ["NX"];
  let claimed = await redis<number>("SET", key("email", email), id, ...claimArgs);
  if (!claimed && await releaseAbandonedClaim(key("email", email))) {
    claimed = await redis<number>("SET", key("email", email), id, ...claimArgs);
  }
  if (!claimed) throw new Error("EMAIL_EXISTS");
  if (phone) {
    let phoneClaimed = await redis<number>("SET", key("phone", phone), id, ...claimArgs);
    if (!phoneClaimed && await releaseAbandonedClaim(key("phone", phone))) {
      phoneClaimed = await redis<number>("SET", key("phone", phone), id, ...claimArgs);
    }
    if (!phoneClaimed) {
      // Release only the claim this registration just made.
      await deleteIfEquals(key("email", email), id);
      throw new Error("PHONE_EXISTS");
    }
  }
  const now = new Date().toISOString();
  const isAdmin = adminEmails().has(email);
  const user: TapUser = {
    id,
    name: input.name.trim(),
    email,
    phone,
    passwordHash,
    provider: input.provider,
    emailVerifiedAt: temporaryClaim ? undefined : now,
    emailVerificationStartedAt: temporaryClaim ? now : undefined,
    verificationSource: temporaryClaim ? undefined : input.provider === "google" ? "google" : "grandfathered",
    // Google is the only signup path that proves ownership at creation time;
    // credential signups become admin later, after they verify with a code.
    role: isAdmin && input.provider === "google" ? "admin" : "creator",
    membership: isAdmin && input.provider === "google" ? "verified" : "pending",
    createdAt: now,
    updatedAt: now,
  };
  await Promise.all([
    setJson(key("user", id), user),
    redis("ZADD", key("users"), Date.now(), id),
    // Pending registrations get their own index so the expiry sweep never has
    // to read every user just to find the few that never finished verifying.
    temporaryClaim ? redis("ZADD", key("users", "pending"), Date.parse(now), id) : Promise.resolve(),
  ]);
  await bumpUserRevision();
  return user;
}

export async function upsertGoogleUser(input: { name: string; email: string }) {
  const existing = await findUserByEmail(input.email);
  if (!existing) return createUser({ ...input, provider: "google" });
  return withRecordLock("user", existing.id, async (session) => {
    const user = await getJson<TapUser>(key("user", existing.id));
    if (!user) throw new Error("USER_NOT_FOUND");
    const isAdmin = adminEmails().has(normalizeEmail(input.email));
    const { emailVerificationStartedAt: _pendingSince, ...verifiedUser } = user;
    void _pendingSince;
    const updated = { ...verifiedUser, name: user.name || input.name, emailVerifiedAt: user.emailVerifiedAt ?? new Date().toISOString(), verificationSource: strongerVerification(user.verificationSource, "google"), role: isAdmin ? "admin" as const : user.role, membership: isAdmin ? "verified" as const : user.membership, updatedAt: new Date().toISOString() };
    await session.commit(async () => {
      await setJson(key("user", user.id), updated);
      await bumpUserRevision();
    });
    return updated;
  });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const sessionHash = tokenHash(token);
  await Promise.all([
    setJson(key("session", sessionHash), { userId, createdAt: new Date().toISOString() }, SESSION_TTL),
    redis("ZADD", key("user", userId, "sessions"), Date.now(), sessionHash),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await redis("DEL", key("session", tokenHash(token)));
  jar.delete(SESSION_COOKIE);
}

/**
 * A one-time code has exactly three answers, and they are not interchangeable.
 *
 * `committed` is the only one that may sign anybody in: this request spent the
 * code and wrote the record. `acknowledged` says the same request already landed
 * — the caller may report success and nothing more, because the code is gone and
 * the work is done. `rejected` covers a code that is wrong, expired, or replayed
 * with a different purpose or a different payload than the one that committed.
 *
 * Collapsing `acknowledged` into `committed` is what let a spent code mint a new
 * session on every replay for the life of its receipt.
 */
export type ChallengeResult =
  | { status: "committed"; user: TapUser }
  | { status: "acknowledged"; userId: string }
  | { status: "rejected" }
  /**
   * The account cannot take the address or the number it is verifying, because
   * another account already holds it. Nothing was written and the code was not
   * spent, but no retry will help until somebody frees the claim.
   */
  | { status: "claim_conflict"; claim: "email" | "phone" };

/**
 * A verify reissue that arrived with no proof of which account it belongs to.
 *
 * The caller is told nothing, but somebody may be locked out: their code expired
 * and their client lost the token. Support needs to see that, and the address is
 * the only thing worth recording — deduplicated for an hour so a person retrying
 * does not bury everything else.
 */
export async function noteVerifyPrincipalRefusal(email: string) {
  try {
    const normalised = normalizeEmail(email);
    if (!(await redis<number | null>("SET", key("verify-refusal-notice", normalised), "1", "NX", "EX", 3600))) return;
    await recordAudit({
      actorId: "system:verify",
      action: "verify.principal_unproven",
      targetId: normalised,
      after: { reason: "no_continuation_proof", recovery: "reset" },
    });
  } catch { /* The refusal has already happened; the trail must not change it. */ }
}

/**
 * Support cannot help with a conflict nobody records. Deduplicated per account
 * and claim for an hour, so a person retrying does not bury every other event.
 */
async function noteClaimConflict(user: TapUser, claim: "email" | "phone", stage: "code_request" | "commit") {
  try {
    const noticeKey = key("claim-conflict-notice", user.id, claim, stage);
    if (!(await redis<number | null>("SET", noticeKey, "1", "NX", "EX", 3600))) return;
    const heldBy = await redis<string | null>("GET", key(claim, claim === "email" ? user.email : user.phone ?? ""));
    await recordAudit({
      actorId: "system:claim",
      action: "challenge.claim_conflict",
      targetId: user.id,
      before: { claim, stage },
      // The caller is never told who holds it; admins are, because that is the
      // one fact support needs to decide whose claim it is.
      after: { claim, stage, heldBy: heldBy ?? null, email: user.email },
    });
  } catch { /* The refusal itself has already happened and must not be undone. */ }
}

/**
 * Reached only if a writer stops handling an outcome the primitive can return.
 * The parameter is typed `never`, so that mistake is a compile error rather than
 * something discovered in production.
 */
function assertNoOutcomeLeftUnhandled(outcome: never): never {
  throw new Error(`UNHANDLED_COMMIT_OUTCOME:${JSON.stringify(outcome)}`);
}

class ClaimConflictError extends Error {
  constructor(readonly claim: "email" | "phone") {
    super(`CLAIM_CONFLICT:${claim}`);
    this.name = "ClaimConflictError";
  }
}

async function acknowledgeCommittedChallenge(input: { challengeId: string; code: string; purpose: EmailAuthPurpose; payload?: string }): Promise<ChallengeResult> {
  const receipt = await readChallengeReceipt({ id: input.challengeId, code: input.code, purpose: input.purpose, payload: input.payload });
  // No record is read and no session is minted here on purpose: the caller is
  // being told an outcome, not being authenticated.
  return receipt ? { status: "acknowledged", userId: receipt.userId } : { status: "rejected" };
}

export async function verifyEmailWithChallenge(challengeId: string, code: string): Promise<ChallengeResult> {
  const pending = await peekEmailChallenge(challengeId, code, "verify");
  if (!pending) return acknowledgeCommittedChallenge({ challengeId, code, purpose: "verify" });
  let committed: { user: TapUser; next: TapUser } | null;
  try {
    committed = await withRecordLock("user", pending.userId, async (session) => {
    const user = await getJson<TapUser>(key("user", pending.userId));
    if (!user) throw new Error("USER_NOT_FOUND");
    const { emailVerificationStartedAt: _pendingSince, ...verifiedUser } = user;
    void _pendingSince;
    const next: TapUser = { ...verifiedUser, emailVerifiedAt: user.emailVerifiedAt ?? new Date().toISOString(), verificationSource: strongerVerification(user.verificationSource, "code"), updatedAt: new Date().toISOString() };
    // The code is spent, the record written, and the claims this account owns
    // made permanent by one script, so a lease that changes hands can never
    // leave the code gone and the record — or its address — behind.
    const outcome = await commitWithChallenge({
      lockKey: session.lockKey,
      lockToken: session.lockToken,
      challengeGuardKey: challengeGuardKey(challengeId),
      challengeGuardValue: challengeGuardValue(challengeId, code),
      recordKey: key("user", pending.userId),
      recordValue: JSON.stringify(next),
      receiptKey: challengeReceiptKey(challengeId),
      receiptValue: challengeReceiptValue({ id: challengeId, code, purpose: "verify", userId: pending.userId }),
      receiptTtlSeconds: CHALLENGE_RECEIPT_TTL_SECONDS,
      indexes: [
        { name: "email", storageKey: key("email", user.email), value: pending.userId },
        ...(user.phone ? [{ name: "phone", storageKey: key("phone", user.phone), value: pending.userId }] : []),
      ],
    });
    // A switch rather than a chain of ifs: adding an outcome to the primitive then
    // becomes a compile error at every writer instead of a silent fall-through to
    // the success path. That fall-through is exactly how a refused commit was once
    // reported as done.
    switch (outcome.status) {
      case "challenge_spent": return null;
      case "lock_lost": throw new MutationConflictError("user", pending.userId);
      // The registration claim on this address or number expired and somebody else
      // took it. Verifying anyway would hand them somebody else's identity, so this
      // fails closed: no record write, no receipt, and the code stays unspent.
      case "index_conflict": throw new ClaimConflictError(outcome.index === "phone" ? "phone" : "email");
      case "committed": return { user, next };
      default: return assertNoOutcomeLeftUnhandled(outcome);
    }
    });
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      const owner = await getJson<TapUser>(key("user", pending.userId));
      if (owner) await noteClaimConflict(owner, error.claim, "commit");
      return { status: "claim_conflict", claim: error.claim };
    }
    throw error;
  }
  // Another request holding the same code committed first. It landed, so this one
  // acknowledges it instead of calling a valid code wrong.
  if (!committed) return acknowledgeCommittedChallenge({ challengeId, code, purpose: "verify" });
  const settled = await settleChallengeCommit({ userId: pending.userId, purpose: "verify", challengeId, email: committed.user.email, record: committed.next });
  // The committed record is the fallback: housekeeping may not have been able to
  // re-read the account, and that must not change what this caller is told.
  return { status: "committed", user: settled.record ?? committed.next };
}

export async function resetPasswordWithChallenge(challengeId: string, code: string, password: string): Promise<ChallengeResult> {
  const pending = await peekEmailChallenge(challengeId, code, "reset");
  // A replay only acknowledges the password that actually landed. Sending a
  // different one with the same code changes nothing and is refused.
  if (!pending) return acknowledgeCommittedChallenge({ challengeId, code, purpose: "reset", payload: password });
  const passwordHash = await hashPassword(password);
  let committed: { user: TapUser; next: TapUser } | null;
  try {
    committed = await withRecordLock("user", pending.userId, async (session) => {
    const user = await getJson<TapUser>(key("user", pending.userId));
    if (!user) throw new Error("USER_NOT_FOUND");
    const { emailVerificationStartedAt: _pendingSince, ...verifiedUser } = user;
    void _pendingSince;
    // Old sessions stop authenticating the moment this record lands, so nothing
    // has to be deleted before the commit for the change to be safe.
    const updated: TapUser = { ...verifiedUser, passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date().toISOString(), verificationSource: strongerVerification(user.verificationSource, "code"), sessionsInvalidBefore: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const outcome = await commitWithChallenge({
      lockKey: session.lockKey,
      lockToken: session.lockToken,
      challengeGuardKey: challengeGuardKey(challengeId),
      challengeGuardValue: challengeGuardValue(challengeId, code),
      recordKey: key("user", pending.userId),
      recordValue: JSON.stringify(updated),
      receiptKey: challengeReceiptKey(challengeId),
      receiptValue: challengeReceiptValue({ id: challengeId, code, purpose: "reset", userId: pending.userId, payload: password }),
      receiptTtlSeconds: CHALLENGE_RECEIPT_TTL_SECONDS,
      // A reset proves the address as surely as a verification does, so it also
      // settles the claims — under the same ownership check, so it can never take
      // an address that now belongs to somebody else.
      indexes: [
        { name: "email", storageKey: key("email", user.email), value: pending.userId },
        ...(user.phone ? [{ name: "phone", storageKey: key("phone", user.phone), value: pending.userId }] : []),
      ],
    });
    // Every outcome that is not a commit has to be named. Falling through to the
    // success path meant a refused commit was reported as done: the script wrote
    // nothing, the old password still worked, and the caller was handed a session
    // for a change that never happened.
    switch (outcome.status) {
      case "challenge_spent": return null;
      case "lock_lost": throw new MutationConflictError("user", pending.userId);
      case "index_conflict": throw new ClaimConflictError(outcome.index === "phone" ? "phone" : "email");
      case "committed": return { user, next: updated };
      default: return assertNoOutcomeLeftUnhandled(outcome);
    }
    });
  } catch (error) {
    if (error instanceof ClaimConflictError) {
      const owner = await getJson<TapUser>(key("user", pending.userId));
      if (owner) await noteClaimConflict(owner, error.claim, "commit");
      return { status: "claim_conflict", claim: error.claim };
    }
    throw error;
  }
  if (!committed) return acknowledgeCommittedChallenge({ challengeId, code, purpose: "reset", payload: password });
  const settled = await settleChallengeCommit({ userId: pending.userId, purpose: "reset", challengeId, email: committed.user.email, record: committed.next });
  return { status: "committed", user: settled.record ?? committed.next };
}

// A commit that landed is settled by the housekeeping below, by the next request
// that needs the same repair, or by the sweep — whichever comes first. The debt
// therefore has to survive several sweeps.
const SETTLEMENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const SETTLEMENT_STALE_MS = 60 * 1000;

type ChallengeSettlement = { userId: string; purpose: EmailAuthPurpose; challengeId: string; email: string; steps: string[]; recordedAt: string };

async function recordSettlementDebt(input: Omit<ChallengeSettlement, "recordedAt">) {
  try {
    await setJson(key("challenge-settlement", input.userId), { ...input, recordedAt: new Date().toISOString() } satisfies ChallengeSettlement, SETTLEMENT_TTL_SECONDS);
    await redis("ZADD", key("challenge-settlements"), Date.now(), input.userId);
  } catch { /* Nothing left to write to; the steps below all self-heal on the next request. */ }
  try {
    await recordAudit({ actorId: "system:challenge", action: "challenge.settlement_pending", targetId: input.userId, after: { purpose: input.purpose, steps: input.steps } });
  } catch { /* The commit has already landed; the trail must not undo it. */ }
}

/**
 * Housekeeping that follows a landed commit. Every step here is either
 * idempotent or self-healing, and not one of them decides whether the change
 * took effect — so a failure must never reach the caller. Reporting 500 after a
 * successful commit is what produced the retry these receipts exist to answer.
 */
async function settleChallengeCommit(input: { userId: string; purpose: EmailAuthPurpose; challengeId: string; email: string; record?: TapUser }) {
  let record = input.record ?? await getJson<TapUser>(key("user", input.userId)) ?? undefined;
  const steps: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "challenge", run: () => discardEmailChallenge(input.challengeId) },
    { name: "send-pointer", run: () => releaseEmailSend(input.purpose, input.email, input.challengeId) },
    { name: "pending-index", run: () => redis("ZREM", key("users", "pending"), input.userId) },
    { name: "revision", run: () => bumpUserRevision() },
  ];
  if (input.purpose === "reset") {
    steps.push({ name: "sessions", run: () => revokeSessionsInvalidatedBefore(input.userId) });
  } else {
    // Verification can earn admin access, and the grant is part of the outcome
    // the caller is told about. If it cannot be applied now, the next admin
    // request re-evaluates the allowlist and applies it then.
    steps.push({ name: "admin-role", run: async () => {
      const current = await getJson<TapUser>(key("user", input.userId));
      if (current) record = await reconcileAdminRole(current);
    } });
  }
  const failed: string[] = [];
  // Sequential rather than in parallel: one failing step must not cancel the
  // others or hide which of them still needs doing.
  for (const step of steps) {
    try { await step.run(); } catch { failed.push(step.name); }
  }
  if (failed.length) await recordSettlementDebt({ userId: input.userId, purpose: input.purpose, challengeId: input.challengeId, email: input.email, steps: failed });
  return { failed, record };
}

export async function reconcileChallengeSettlements(olderThan = Date.now() - SETTLEMENT_STALE_MS) {
  const stale = await redis<string[]>("ZRANGEBYSCORE", key("challenge-settlements"), "-inf", String(olderThan));
  let settled = 0;
  let pending = 0;
  for (const userId of stale ?? []) {
    const debt = await getJson<ChallengeSettlement>(key("challenge-settlement", userId));
    if (!debt) {
      // Nothing left to settle, but the queue still names this account. Dropping
      // the member is what keeps it from being retried every night.
      await redis("ZREM", key("challenge-settlements"), userId);
      continue;
    }
    const retried = await settleChallengeCommit({ userId, purpose: debt.purpose, challengeId: debt.challengeId, email: debt.email });
    if (retried.failed.length) { pending += 1; continue; }
    await Promise.all([redis("DEL", key("challenge-settlement", userId)), redis("ZREM", key("challenge-settlements"), userId)]);
    settled += 1;
  }
  return { settled, pending };
}

export async function deletePendingUser(userId: string) {
  return withRecordLock("user", userId, async (session) => {
    const user = await getJson<TapUser>(key("user", userId));
    if (!user || user.emailVerifiedAt || !user.emailVerificationStartedAt) return false;
    await session.commit(async () => {
      await Promise.all([
        // Release only the claims this account still owns.
        deleteIfEquals(key("email", user.email), userId),
        user.phone ? deleteIfEquals(key("phone", user.phone), userId) : Promise.resolve(false),
        redis("DEL", key("user", userId)),
        redis("ZREM", key("users"), userId),
        redis("ZREM", key("users", "pending"), userId),
        redis("DEL", key("phone-intent", userId)),
        redis("ZREM", key("phone-intents"), userId),
      ]);
      await bumpUserRevision();
    });
    return true;
  });
}

export async function cleanupExpiredPendingUsers(olderThan = Date.now() - PENDING_EXPIRY_MS) {
  const expired = await redis<string[]>("ZRANGEBYSCORE", key("users", "pending"), "-inf", String(olderThan));
  const removed = await Promise.all((expired ?? []).map(async (userId) => {
    const deleted = await deletePendingUser(userId);
    // A record that is no longer pending has already been resolved elsewhere;
    // drop the stale index entry so it stops being retried every night.
    if (!deleted) await redis("ZREM", key("users", "pending"), userId);
    return deleted;
  }));
  return removed.filter(Boolean).length;
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getJson<{ userId: string; createdAt?: string }>(key("session", tokenHash(token)));
  if (!session) return null;
  const user = await getJson<TapUser>(key("user", session.userId));
  if (!user) return null;
  // A password reset or an access revocation stamps a cut-off on the record, so
  // sessions issued earlier stop authenticating even before their keys are swept.
  if (user.sessionsInvalidBefore && session.createdAt && Date.parse(session.createdAt) < Date.parse(user.sessionsInvalidBefore)) return null;
  return user;
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

async function revokeAllSessions(userId: string) {
  const sessionHashes = await redis<string[]>("ZREVRANGE", key("user", userId, "sessions"), 0, -1);
  await Promise.all((sessionHashes ?? []).map((sessionHash) => redis("DEL", key("session", sessionHash))));
  await redis("DEL", key("user", userId, "sessions"));
}

/**
 * Sweeps only the sessions the record already refuses to authenticate. A blanket
 * revoke cannot be retried later: by then the account may hold a session created
 * after the cut-off — the one the password reset itself handed out — and deleting
 * that would sign the owner out for reasons they cannot see.
 */
async function revokeSessionsInvalidatedBefore(userId: string) {
  const user = await getJson<TapUser>(key("user", userId));
  const cutoff = user?.sessionsInvalidBefore ? Date.parse(user.sessionsInvalidBefore) : Number.NaN;
  if (Number.isNaN(cutoff)) return;
  const sessionHashes = await redis<string[]>("ZREVRANGE", key("user", userId, "sessions"), 0, -1);
  for (const sessionHash of sessionHashes ?? []) {
    const session = await getJson<{ createdAt?: string }>(key("session", sessionHash));
    if (session?.createdAt && Date.parse(session.createdAt) >= cutoff) continue;
    await redis("DEL", key("session", sessionHash));
    await redis("ZREM", key("user", userId, "sessions"), sessionHash);
  }
}

/**
 * The allowlist is the authority on admin access, re-evaluated on every admin
 * request rather than only at account creation. A stored role that no longer
 * matches is corrected, and a demotion also ends every session that account
 * holds — otherwise offboarding would take up to thirty days to take effect.
 */
/**
 * The allowlist names an address; it cannot prove that the person holding the
 * account owns that address. Granting therefore also requires the account to
 * have proven the email itself, through a one-time code or Google sign-in.
 */
export function provenEmailOwnership(user: TapUser) {
  return Boolean(user.emailVerifiedAt) && (user.verificationSource === "code" || user.verificationSource === "google");
}

async function claimBlockedGrantNotice(userId: string) {
  try { return Boolean(await redis<number | null>("SET", key("admin-grant-notice", userId), "1", "NX", "EX", 3600)); }
  catch { return false; }
}

async function auditAdminDecision(action: string, user: TapUser, after: Record<string, unknown>) {
  try { await recordAudit({ actorId: "system:allowlist", action, targetId: user.id, before: { role: user.role, verificationSource: user.verificationSource ?? null }, after }); }
  catch { /* The access decision has already been applied; the trail must not undo it. */ }
}

/**
 * Does the email index actually name this account?
 *
 * The allowlist names an address, and a record can claim any address it likes.
 * Only the index says who owns it, and it is the same index login resolves
 * against — so an account whose address is held by somebody else is, for every
 * purpose that matters, not that address's owner. Two records could otherwise
 * both carry an allowlisted address, and the one holding admin need not be the
 * one the index points at.
 */
async function ownsEmailIndex(user: TapUser) {
  const holderId = await redis<string | null>("GET", key("email", normalizeEmail(user.email)));
  return holderId === user.id;
}

export async function reconcileAdminRole(user: TapUser) {
  const allowlisted = allowlistedAdmin(user.email);
  // Holding admin requires both: named in the allowlist, and named by the index
  // for that address. Checking only the allowlist let an account keep admin on an
  // address another record owns, and the early return meant nothing ever looked
  // again.
  const entitled = allowlisted && await ownsEmailIndex(user);
  if (entitled === (user.role === "admin")) return user;

  if (!entitled) {
    // Removal is unconditional: an account that is no longer entitled loses access
    // and every session it holds, whatever the record says.
    const reason = allowlisted ? "email_index_mismatch" : "allowlist_removed";
    return withRecordLock("user", user.id, async (session) => {
      const current = await getJson<TapUser>(key("user", user.id));
      if (!current || current.role !== "admin") return current ?? user;
      // Re-read entitlement under the lock. The index may have been repaired
      // between the check above and this line, and revoking on that stale
      // snapshot would sign the rightful admin out of their own account.
      if (allowlistedAdmin(current.email) && await ownsEmailIndex(current)) return current;
      // Marking the cut-off inside the record is what makes revocation take
      // effect; deleting the session keys afterwards is only housekeeping.
      const updated: TapUser = { ...current, role: "creator", sessionsInvalidBefore: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await session.commit(async () => {
        await setJson(key("user", user.id), updated);
        await bumpUserRevision();
      });
      await revokeAllSessions(user.id);
      await auditAdminDecision("admin.revoked", current, { role: "creator", sessionsRevoked: true, reason });
      return updated;
    });
  }

  if (!provenEmailOwnership(user)) {
    // Refusing silently would look like a bug to the operator waiting for access,
    // so the refusal is written down — but at most once an hour per account, or a
    // single reloading tab would push every other event out of the audit view.
    if (await claimBlockedGrantNotice(user.id)) {
      await auditAdminDecision("admin.grant_blocked", user, { role: user.role, reason: "email_ownership_unproven" });
    }
    return user;
  }

  return withRecordLock("user", user.id, async (session) => {
    const current = await getJson<TapUser>(key("user", user.id));
    if (!current || current.role === "admin") return current ?? user;
    if (!provenEmailOwnership(current)) return current;
    // Re-read under the lock: the index may have changed hands since the check
    // above, and granting on a stale read is the whole problem being fixed.
    if (!(await ownsEmailIndex(current))) return current;
    const updated: TapUser = { ...current, role: "admin", membership: "verified", updatedAt: new Date().toISOString() };
    await session.commit(async () => {
      await setJson(key("user", user.id), updated);
      await bumpUserRevision();
    });
    await auditAdminDecision("admin.granted", current, { role: "admin", verificationSource: current.verificationSource });
    return updated;
  });
}

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  const reconciled = await reconcileAdminRole(user);
  return reconciled.role === "admin" ? reconciled : null;
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
  if (reconciled.role !== "admin") redirect("/dashboard?error=forbidden");
  return reconciled;
}

export async function listUsers(input: { offset?: number; limit?: number; q?: string; role?: TapUser["role"] } = {}) {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = (input.q ?? "").trim().toLowerCase();
  if (!q && !input.role) {
    const [ids, total] = await Promise.all([
      redis<string[]>("ZREVRANGE", key("users"), offset, offset + limit - 1),
      redis<number>("ZCARD", key("users")),
    ]);
    return { items: await getJsonMany<TapUser>((ids ?? []).map((id) => key("user", id))), total: Number(total ?? 0) };
  }
  const revision = await currentCollectionRevision("users");
  const cacheKey = JSON.stringify({ q, role: input.role ?? "", revision });
  let filtered = userFilterCache.get(cacheKey);
  if (!filtered) {
    const ids = await redis<string[]>("ZREVRANGE", key("users"), 0, -1);
    const users = await getJsonMany<TapUser>((ids ?? []).map((id) => key("user", id)));
    filtered = users.filter((user) => {
    if (input.role && user.role !== input.role) return false;
    if (!q) return true;
    return `${user.name} ${user.email} ${user.phone} ${user.tiktokUsername ?? ""} ${user.shopeeUsername ?? ""} ${user.recipientName ?? ""} ${user.assignedPic ?? ""}`.toLowerCase().includes(q);
    });
    userFilterCache.set(cacheKey, filtered);
  }
  return { items: filtered.slice(offset, offset + limit), total: filtered.length };
}

// A move is settled by the next write on that account or by the scheduled sweep,
// whichever comes first. The record therefore has to survive several sweeps.
const PHONE_INTENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const PHONE_INTENT_STALE_MS = 5 * 60 * 1000;

async function releasePhoneClaim(phone: string, userId: string) {
  await deleteIfEquals(key("phone", phone), userId);
}

export async function updateMembership(userId: string, membership: TapUser["membership"]) {
  return withRecordLock("user", userId, async (session) => {
    const user = await getJson<TapUser>(key("user", userId));
    if (!user) throw new Error("USER_NOT_FOUND");
    const updated = { ...user, membership, updatedAt: new Date().toISOString() };
    await session.commit(async () => {
      await setJson(key("user", userId), updated);
      await bumpUserRevision();
    });
    return updated;
  });
}

/**
 * The record and the phone index are two keys, so a process that dies between
 * them leaves a claim with no owner. Every phone move writes an intent first,
 * and this repair reads the record as the truth and settles both claims from it.
 * It is idempotent, so running it again costs nothing.
 */
export async function reconcilePhoneClaims(userId: string) {
  const intent = await getJson<{ from: string; to: string }>(key("phone-intent", userId));
  if (!intent) {
    // No intent left to settle, but the index still names this account. Dropping
    // the member is what keeps the queue from growing with entries nobody reads.
    await redis("ZREM", key("phone-intents"), userId);
    return false;
  }
  const user = await getJson<TapUser>(key("user", userId));
  const truth = user?.phone ?? "";
  for (const candidate of [intent.from, intent.to]) {
    if (!candidate || candidate === truth) continue;
    await deleteIfEquals(key("phone", candidate), userId);
  }
  if (truth) {
    const owner = await redis<string | null>("GET", key("phone", truth));
    // Never take a number that now belongs to somebody else; only fill a gap.
    if (owner === null || owner === undefined) await redis("SET", key("phone", truth), userId, "NX");
  }
  await Promise.all([redis("DEL", key("phone-intent", userId)), redis("ZREM", key("phone-intents"), userId)]);
  return true;
}

export async function reconcileStalePhoneClaims(olderThan = Date.now() - PHONE_INTENT_STALE_MS) {
  const stale = await redis<string[]>("ZRANGEBYSCORE", key("phone-intents"), "-inf", String(olderThan));
  // A system job retries rather than surfacing a conflict, and reports how many
  // accounts it could not reach so a persistent contention shows up in telemetry.
  const outcomes = await Promise.all((stale ?? []).map(async (userId) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await withRecordLock("user", userId, (session) => session.commit(() => reconcilePhoneClaims(userId))); }
      catch (error) { if (!isMutationConflict(error) || attempt === 1) return null; }
    }
    return null;
  }));
  return { repaired: outcomes.filter(Boolean).length, contended: outcomes.filter((outcome) => outcome === null).length };
}

export async function updateProfile(userId: string, input: Partial<Pick<TapUser, "name" | "phone" | "tiktokUsername" | "shopeeUsername" | "niche" | "followers" | "gmv" | "recipientName" | "address" | "assignedPic">>) {
  return withRecordLock("user", userId, async (session) => {
    // Heal anything an interrupted move left behind before reading the record.
    // The repair writes, so it goes through the same commit as every other write
    // in this section: a holder whose lease already moved on must not be the one
    // deciding which claims survive.
    await session.commit(() => reconcilePhoneClaims(userId));
    const user = await getJson<TapUser>(key("user", userId));
    if (!user) throw new Error("USER_NOT_FOUND");
    const nextPhone = input.phone === undefined ? user.phone : normalizePhone(input.phone);
    const phoneChanged = nextPhone !== user.phone;

    if (!phoneChanged) {
      const updated = { ...user, ...input, phone: nextPhone, updatedAt: new Date().toISOString() };
      await session.commit(async () => {
        await setJson(key("user", userId), updated);
        await bumpUserRevision();
      });
      return updated;
    }

    // The intent must outlive the repair cycle. A fifteen-minute record against a
    // nightly reconciler expires unread, leaving exactly the orphan it was meant
    // to describe.
    const intent = { from: user.phone ?? "", to: nextPhone };
    await session.commit(async () => Promise.all([
      setJson(key("phone-intent", userId), intent, PHONE_INTENT_TTL_SECONDS),
      redis("ZADD", key("phone-intents"), Date.now(), userId),
    ]));
    try {
      if (nextPhone) {
        const claimed = await redis<number>("SET", key("phone", nextPhone), userId, "NX");
        if (!claimed) {
          const owner = await redis<string | null>("GET", key("phone", nextPhone));
          if (owner !== userId) throw new Error("PHONE_EXISTS");
        }
      }
      const updated = { ...user, ...input, phone: nextPhone, updatedAt: new Date().toISOString() };
      await session.commit(async () => {
        await setJson(key("user", userId), updated);
        // The intent is the only record of a half-done move, so it survives until
        // the old claim is provably gone. Clearing it on a failed release is what
        // left two live claims with nothing for the reconciler to find.
        if (user.phone) await releasePhoneClaim(user.phone, userId);
        await Promise.all([redis("DEL", key("phone-intent", userId)), redis("ZREM", key("phone-intents"), userId)]);
        await bumpUserRevision();
      });
      return updated;
    } catch (error) {
      // The record is still the truth, so settling from it undoes a half-done move.
      // If even that cannot be done, the intent survives and the sweep settles it;
      // either way the caller hears about the original failure, not this one.
      try { await session.commit(() => reconcilePhoneClaims(userId)); }
      catch { /* The intent is still on the queue for the reconciler. */ }
      throw error;
    }
  });
}
