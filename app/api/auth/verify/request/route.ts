import { findUserByEmail, noteVerifyPrincipalRefusal } from "../../../../../lib/auth";
import { authEmailEnabled, createEmailChallenge, debugEmailCode, issueVerifyContinuation, readVerifyContinuation, releaseEmailSend, reserveEmailSend, tryDiscardEmailChallenge, sendEmailCode, type EmailAuthPurpose } from "../../../../../lib/email-auth";
import { checkRateLimit, retryAfterMessage } from "../../../../../lib/rate-limit";
import { cleanText, clientIp, sameOrigin, validEmail } from "../../../../../lib/security";
import { getJson, key } from "../../../../../lib/redis";
import type { TapUser } from "../../../../../lib/models";
import { randomBytes } from "node:crypto";

/** Identical in shape to a real send, so the endpoint never confirms an address. */
function opaqueAccepted() {
  return Response.json({ sent: true, challengeId: randomBytes(32).toString("base64url") });
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
    if (!authEmailEnabled()) return Response.json({ error: "Pemulihan akun belum tersedia. Hubungi tim Haluan." }, { status: 503 });
    const body = await request.json();
    const email = cleanText(body.email, 254).toLowerCase();
    const purpose: EmailAuthPurpose = body.purpose === "verify" ? "verify" : "reset";
    const continuation = cleanText(body.continuation, 128);
    if (purpose === "reset" && !validEmail(email)) return Response.json({ error: "Masukkan email yang valid." }, { status: 400 });
    // Abuse is bounded at the sender. The address itself is never refused: it
    // either receives a new code or is handed the one it already owns.
    const senderRate = await checkRateLimit("email-request-ip", clientIp(request), 20, 3600);
    if (!senderRate.allowed) {
      return Response.json(
        { error: `Terlalu banyak permintaan kode. Coba lagi dalam ${retryAfterMessage(senderRate.retryAfterSeconds)}.` },
        { status: 429, headers: { "retry-after": String(senderRate.retryAfterSeconds) } },
      );
    }

    let user: TapUser | null = null;
    if (purpose === "verify") {
      // A verification code activates one specific account, so the caller has to
      // name that account with proof: a token handed out when they created it, or
      // when they passed a password check on it. An email address only proves who
      // reads the inbox, and more than one account can claim the same address —
      // choosing whoever currently holds the email index let an inbox owner
      // activate a stranger's account while the password that stranger chose kept
      // working.
      const provenUserId = continuation ? await readVerifyContinuation(continuation) : null;
      if (!provenUserId) {
        if (email) await noteVerifyPrincipalRefusal(email);
        return opaqueAccepted();
      }
      // The address is read from the record, never from the request body, so a
      // token cannot redirect a code to an inbox the caller names.
      user = await getJson<TapUser>(key("user", provenUserId));
      if (!user || user.emailVerifiedAt) return opaqueAccepted();
    } else {
      user = await findUserByEmail(email);
      if (!user || !user.passwordHash) return opaqueAccepted();
    }

    const reservation = await reserveEmailSend(purpose, user.email);
    if (!reservation.reserved) {
      // Someone already holds the live challenge for this address. Handing back
      // that same id is what keeps the owner from ever being locked out.
      if (!reservation.id) return Response.json({ error: "Kode sedang disiapkan. Coba lagi beberapa detik lagi." }, { status: 503 });
      return Response.json({ sent: true, challengeId: reservation.id, reused: true });
    }
    try {
      const challenge = await createEmailChallenge({ userId: user.id, email: user.email, purpose, id: reservation.id! });
      await sendEmailCode({ email: user.email, name: user.name, purpose, code: challenge.code });
      // A fresh proof travels with the new code, so the next reissue stays bound
      // to this account without the client having to keep the first one.
      const nextContinuation = purpose === "verify" ? await issueVerifyContinuation(user.id) : undefined;
      return Response.json({ sent: true, challengeId: challenge.id, debugCode: debugEmailCode(challenge.code), continuation: nextContinuation });
    } catch (error) {
      // Nothing reached the inbox, so the address must be free to try again now
      // instead of waiting out a window for a code that never arrived.
      await Promise.all([tryDiscardEmailChallenge(reservation.id!), releaseEmailSend(purpose, user.email, reservation.id!)]);
      throw error;
    }
  } catch {
    return Response.json({ error: "Kode belum dapat dikirim. Coba kembali." }, { status: 500 });
  }
}
