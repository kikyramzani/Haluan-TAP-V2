import { createSession, createUser, deletePendingUser, publicUser } from "../../../../lib/auth";
import { checkRateLimit, retryAfterMessage } from "../../../../lib/rate-limit";
import { cleanText, clientIp, sameOrigin, safeReturnTo, validEmail, validPassword } from "../../../../lib/security";
import { authEmailEnabled, createEmailChallenge, debugEmailCode, issueVerifyContinuation, reserveEmailSend, tryDiscardEmailChallenge, sendEmailCode, tryReleaseEmailSend } from "../../../../lib/email-auth";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
    const body = await request.json();
    const name = cleanText(body.name, 80);
    const email = cleanText(body.email, 254).toLowerCase();
    const phone = cleanText(body.phone, 24);
    const [ipRate, accountRate] = await Promise.all([checkRateLimit("register-ip", clientIp(request), 6, 3600), checkRateLimit("register-account", email || phone || "invalid", 3, 3600)]);
    const blocked = !ipRate.allowed ? ipRate : !accountRate.allowed ? accountRate : null;
    if (blocked) return Response.json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfterMessage(blocked.retryAfterSeconds)}.` }, { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } });
    const password = typeof body.password === "string" ? body.password : "";
    if (name.length < 2 || !validEmail(email) || phone.replace(/\D/g, "").length < 9 || !validPassword(password) || body.consent !== true) {
      return Response.json({ error: "Periksa nama, email, WhatsApp, password, dan persetujuan kamu." }, { status: 400 });
    }
    const verificationRequired = authEmailEnabled();
    const user = await createUser({ name, email, phone, password, provider: "credentials", requireEmailVerification: verificationRequired });
    if (verificationRequired) {
      // A reservation this request does not own is not a licence to send. Minting
      // a fresh id would bypass the send right entirely, so registration fails
      // closed and the account is rolled back instead.
      const reservation = await reserveEmailSend("verify", user.email);
      if (!reservation.reserved || !reservation.id) {
        await deletePendingUser(user.id);
        return Response.json({ error: "Email verifikasi belum dapat dikirim. Coba kembali beberapa saat lagi." }, { status: 503 });
      }
      try {
        const challenge = await createEmailChallenge({ userId: user.id, email: user.email, purpose: "verify", id: reservation.id });
        await sendEmailCode({ email: user.email, name: user.name, purpose: "verify", code: challenge.code });
        // Proof that this client is the one continuing *this* account's signup. A
        // later code can only be reissued against it, so an address alone never
        // decides which account a verification activates.
        const continuation = await issueVerifyContinuation(user.id);
        return Response.json({ verificationRequired: true, challengeId: challenge.id, continuation, debugCode: debugEmailCode(challenge.code), returnTo: safeReturnTo(body.returnTo) }, { status: 202 });
      } catch (error) {
        // Dropping the account is the part that must happen; releasing the pointer
        // only lets the address retry sooner, and it expires on its own. Running
        // them together let a failed release skip the deletion and strand a
        // pending account holding the very address it was rolled back from.
        await tryDiscardEmailChallenge(reservation.id);
        await deletePendingUser(user.id);
        await tryReleaseEmailSend("verify", user.email, reservation.id);
        throw error;
      }
    }
    await createSession(user.id);
    return Response.json({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "EMAIL_EXISTS" || code === "PHONE_EXISTS") return Response.json({ error: "Akun dengan data tersebut tidak dapat dibuat. Coba masuk atau hubungi tim Haluan." }, { status: 409 });
    if (code === "TAP_DATASTORE_UNAVAILABLE") return Response.json({ error: "Pendaftaran sedang disiapkan. Silakan hubungi tim Haluan." }, { status: 503 });
    if (code === "AUTH_EMAIL_SEND_FAILED" || code === "AUTH_EMAIL_UNAVAILABLE") return Response.json({ error: "Email verifikasi belum dapat dikirim. Coba kembali beberapa saat lagi." }, { status: 503 });
    return Response.json({ error: "Pendaftaran gagal. Coba kembali." }, { status: 500 });
  }
}
