import { createHash, randomBytes, randomInt } from "node:crypto";
import { getJson, key, redis, setJson } from "./redis.ts";
import { deleteIfEquals, tryDeleteIfEquals } from "./atomic.ts";
import { emailTestModeEnabled, localEmailModeEnabled } from "./email-mode.ts";

export { authEmailEnabled, debugEmailCode } from "./email-mode.ts";

export type EmailAuthPurpose = "verify" | "reset";
type EmailChallenge = { userId: string; email: string; purpose: EmailAuthPurpose; codeHash: string; createdAt: string };

export const CHALLENGE_TTL_SECONDS = 60 * 30;

/**
 * A registration's email and phone claims have no expiry at all. Giving them a
 * lifetime of their own — even one comfortably longer than a code — creates a
 * window where the record still exists but the address is free, and the next
 * signup can take it. The account that then holds the index is not necessarily
 * the account whose owner is reading the inbox. Claims are released by the
 * cleanup that deletes the record, and by nothing else.
 */
const CHALLENGE_TTL = CHALLENGE_TTL_SECONDS;

/**
 * Proof that the caller is continuing a specific account's registration.
 *
 * A verification code may only be reissued for a userId somebody has proven —
 * by creating the account in this session, or by passing a password check on it.
 * Choosing the account from the email address instead let whoever happened to
 * hold the email index become the target: the inbox owner would verify a
 * stranger's account, and the password that stranger chose kept working.
 */
const CONTINUATION_TTL_SECONDS = 60 * 60 * 24;

function continuationKey(token: string) {
  return key("verify-continuation", hash(token));
}

export async function issueVerifyContinuation(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await redis("SET", continuationKey(token), userId, "EX", CONTINUATION_TTL_SECONDS);
  return token;
}

export async function readVerifyContinuation(token: string) {
  if (!token) return null;
  return redis<string | null>("GET", continuationKey(token));
}

export async function revokeVerifyContinuation(token: string) {
  try { await redis("DEL", continuationKey(token)); }
  catch { /* It expires on its own, and it only ever names one account. */ }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const RESEND_WINDOW_SECONDS = 300;

function activeChallengeKey(purpose: EmailAuthPurpose, email: string) {
  return key("email-challenge", "active", purpose, hash(email));
}

/**
 * One atomic write decides both questions at once: may this request send, and
 * which challenge does the address currently own. Two concurrent requests can
 * never both win, and the loser always reads a real id rather than a fabricated
 * one, because the pointer is written by the same operation that grants the send.
 */
export async function reserveEmailSend(purpose: EmailAuthPurpose, email: string) {
  const id = randomBytes(32).toString("base64url");
  try {
    const reserved = await redis<number | null>("SET", activeChallengeKey(purpose, email), id, "NX", "EX", RESEND_WINDOW_SECONDS);
    if (reserved) return { id, reserved: true as const };
    const active = await redis<string | null>("GET", activeChallengeKey(purpose, email));
    return { id: active, reserved: false as const };
  } catch { return { id: null, reserved: false as const }; }
}

export async function releaseEmailSend(purpose: EmailAuthPurpose, email: string, id: string) {
  // Compare and delete together: a later reservation must not be dropped by the
  // holder it replaced. This throws, because a rollback that only looked like it
  // happened leaves the address unable to ask for another code.
  await deleteIfEquals(activeChallengeKey(purpose, email), id);
}

/**
 * For call sites where the send right no longer decides anything and the work
 * that mattered has already landed. The pointer expires within the resend window
 * on its own, so failing here must not undo a change the person can already see.
 */
export async function tryReleaseEmailSend(purpose: EmailAuthPurpose, email: string, id: string) {
  return tryDeleteIfEquals(activeChallengeKey(purpose, email), id);
}

export function challengeGuardKey(id: string) {
  return key("email-challenge", hash(id), "guard");
}

export function challengeGuardValue(id: string, code: string) {
  return hash(`${id}:${code}`);
}

const RECEIPT_TTL_SECONDS = CHALLENGE_TTL_SECONDS;

export function challengeReceiptKey(id: string) {
  return key("email-challenge", hash(id), "receipt");
}

/**
 * A commit that lands but whose response never arrives must not look like a
 * wrong code on the retry. The receipt is written by the same script as the
 * commit and says one thing only: this exact request already landed.
 *
 * It is bound to the code, the purpose, and the payload the commit was made
 * with, and callers may only acknowledge it — never authenticate on it. The
 * first design bound it to the code alone and let the caller mint a session
 * from what it returned, which turned a spent code into a session-minting
 * primitive that accepted any payload for as long as the receipt lived.
 */
function receiptProof(input: { id: string; code: string; purpose: EmailAuthPurpose; payload: string }) {
  return hash(`${input.id}:${input.code}:${input.purpose}:${input.payload}`);
}

export async function readChallengeReceipt(input: { id: string; code: string; purpose: EmailAuthPurpose; payload?: string }) {
  const stored = await redis<string | null>("GET", challengeReceiptKey(input.id));
  if (!stored) return null;
  let parsed: { v?: number; purpose?: string; userId?: string; proof?: string };
  try { parsed = JSON.parse(stored); } catch { return null; }
  if (parsed.v !== 1 || !parsed.userId) return null;
  // A verify receipt must never answer at the reset endpoint, nor the reverse,
  // even though both are reached with the same challenge id.
  if (parsed.purpose !== input.purpose) return null;
  if (parsed.proof !== receiptProof({ id: input.id, code: input.code, purpose: input.purpose, payload: input.payload ?? "" })) return null;
  return { userId: String(parsed.userId) };
}

export function challengeReceiptValue(input: { id: string; code: string; purpose: EmailAuthPurpose; userId: string; payload?: string }) {
  return JSON.stringify({
    v: 1,
    purpose: input.purpose,
    userId: input.userId,
    proof: receiptProof({ id: input.id, code: input.code, purpose: input.purpose, payload: input.payload ?? "" }),
  });
}

export const CHALLENGE_RECEIPT_TTL_SECONDS = RECEIPT_TTL_SECONDS;

export async function createEmailChallenge(input: { userId: string; email: string; purpose: EmailAuthPurpose; id: string }) {
  const code = String(randomInt(100000, 1_000_000));
  const codeHash = challengeGuardValue(input.id, code);
  await Promise.all([
    setJson(key("email-challenge", hash(input.id)), {
      userId: input.userId,
      email: input.email,
      purpose: input.purpose,
      codeHash,
      createdAt: new Date().toISOString(),
    } satisfies EmailChallenge, CHALLENGE_TTL),
    // A plain string beside the record, so spending the code and writing the
    // record it authorises can happen inside one script.
    redis("SET", challengeGuardKey(input.id), codeHash, "EX", CHALLENGE_TTL),
  ]);
  return { id: input.id, code };
}

/**
 * Removes the challenge record and its guard. This throws: settlement counts on
 * hearing about a failure here, and a version that swallowed the error reported
 * housekeeping as complete while the challenge JSON was still sitting there.
 */
export async function discardEmailChallenge(id: string) {
  await Promise.all([redis("DEL", key("email-challenge", hash(id))), redis("DEL", challengeGuardKey(id))]);
}

/** For rollbacks that are already unwinding: both keys expire on their own. */
export async function tryDiscardEmailChallenge(id: string) {
  try { await discardEmailChallenge(id); return true; }
  catch { return false; }
}

/**
 * Reads the challenge without spending it, so a caller can take the record lock
 * it will need before the code becomes unrecoverable.
 */
export async function peekEmailChallenge(id: string, code: string, purpose: EmailAuthPurpose) {
  const challenge = await getJson<EmailChallenge>(key("email-challenge", hash(id)));
  if (!challenge || challenge.purpose !== purpose || challenge.codeHash !== hash(`${id}:${code}`)) return null;
  return challenge;
}

export async function sendEmailCode(input: { email: string; name: string; purpose: EmailAuthPurpose; code: string }) {
  if (emailTestModeEnabled()) return;
  if (localEmailModeEnabled()) {
    const response = await fetch(process.env.AUTH_EMAIL_LOCAL_ENDPOINT!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("AUTH_EMAIL_SEND_FAILED");
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("AUTH_EMAIL_UNAVAILABLE");
  const action = input.purpose === "verify" ? "verifikasi akun" : "reset kata sandi";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: `${input.code} — ${action} TAP`,
      html: `<p>Hai ${escapeHtml(input.name)},</p><p>Kode ${action} TAP kamu:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p><p>Kode berlaku 30 menit. Abaikan email ini jika kamu tidak meminta perubahan.</p>`,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AUTH_EMAIL_SEND_FAILED");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
