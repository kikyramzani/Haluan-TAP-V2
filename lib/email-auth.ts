import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db.ts";
import { emailTestModeEnabled, localEmailModeEnabled } from "./email-mode.ts";

export { authEmailEnabled, debugEmailCode } from "./email-mode.ts";

export type EmailAuthPurpose = "verify" | "reset";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function purposeToPrisma(purpose: EmailAuthPurpose) {
  return purpose === "verify" ? ("VERIFY" as const) : ("RESET" as const);
}

const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const RESEND_WINDOW_MS = 5 * 60 * 1000;

/**
 * One active challenge per (account, purpose): a retried request within the
 * resend window is handed the same id instead of minting a second code,
 * mirroring the previous Redis behaviour. Unlike that version, no separate
 * reservation step is needed. Postgres already serializes the read+create
 * inside one request, and a rare double-send under true concurrency is a
 * minor nuisance, not a security issue (both codes would still require the
 * same rate-limited account to be entered correctly).
 */
export async function createEmailChallenge(input: { userId: string; email: string; purpose: EmailAuthPurpose }) {
  const purpose = purposeToPrisma(input.purpose);
  const active = await prisma.emailChallenge.findFirst({
    where: { userId: input.userId, purpose, consumedAt: null, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - RESEND_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (active) return { id: active.id, code: null as string | null, reused: true as const };

  const id = randomBytes(24).toString("base64url");
  const code = String(randomInt(100000, 1_000_000));
  const codeHash = hash(`${id}:${code}`);
  await prisma.emailChallenge.create({
    data: { id, userId: input.userId, purpose, codeHash, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return { id, code: code as string | null, reused: false as const };
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

/**
 * Proof that the caller is continuing a specific account's registration or
 * login, so a verify-code reissue can only be requested by someone who has
 * already shown they control that account. Not merely typed its email
 * address. Stateless (HMAC-signed, no storage): unlike the Redis version's
 * stored token, there is nothing to expire-sweep, at the cost of not being
 * individually revocable before its own TTL. Which nothing in this app
 * needs (a continuation only ever grants "may ask for one more code").
 */
const CONTINUATION_TTL_MS = 24 * 60 * 60 * 1000;

function continuationSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_TOKEN_SECRET_MISSING");
  return secret;
}

export function issueVerifyContinuation(userId: string) {
  const payload = `${userId}.${Date.now() + CONTINUATION_TTL_MS}`;
  const signature = createHmac("sha256", continuationSecret()).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

export function readVerifyContinuation(token: string): string | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 0) return null;
  const payloadB64 = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", continuationSecret()).update(payload).digest("base64url");
  const actual = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return null;
  const separatorIndex = payload.lastIndexOf(".");
  if (separatorIndex < 0) return null;
  const userId = payload.slice(0, separatorIndex);
  const expiresAt = Number(payload.slice(separatorIndex + 1));
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return userId;
}
