import { createSession, publicUser, verifyEmailWithChallenge } from "../../../../../lib/auth";
import { cleanText, clientIp, sameOrigin, safeReturnTo } from "../../../../../lib/security";
import { checkRateLimit, retryAfterMessage } from "../../../../../lib/rate-limit";
import { hashIp } from "../../../../../lib/hash-ip";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
    const body = await request.json();
    const challengeId = cleanText(body.challengeId, 128);
    const [challengeRate, senderRate] = await Promise.all([
      checkRateLimit("verify-confirm", challengeId || "invalid", 30, 3600),
      checkRateLimit("verify-confirm-ip", hashIp(clientIp(request)), 10, 3600),
    ]);
    const blocked = !senderRate.allowed ? senderRate : !challengeRate.allowed ? challengeRate : null;
    if (blocked) return Response.json({ error: `Terlalu banyak percobaan kode. Coba lagi dalam ${retryAfterMessage(blocked.retryAfterSeconds)}.` }, { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } });
    const result = await verifyEmailWithChallenge(challengeId, cleanText(body.code, 6));
    if (result.status === "rejected") return Response.json({ error: "Kode salah atau sudah kedaluwarsa." }, { status: 400 });
    // The address or the number is held by another account now, so verifying would
    // move somebody else's identity onto this one. The code is untouched, but a
    // retry cannot fix this — only support can.
    if (result.status === "claim_conflict") {
      const detail = result.claim === "phone"
        ? "Nomor WhatsApp di akun ini sudah dipakai akun lain."
        : "Email ini sudah dipakai akun lain.";
      return Response.json({ error: `${detail} Hubungi tim Haluan supaya kami bisa merapikannya.` }, { status: 409 });
    }
    // The code was already spent by a request that landed. Saying so is the whole
    // answer: only the request that actually committed may be signed in, or a
    // used code would keep handing out sessions for as long as it is remembered.
    if (result.status === "acknowledged") {
      return Response.json({ verified: true, signedIn: false, notice: "Email kamu sudah terverifikasi. Masuk dengan email dan kata sandi kamu." });
    }
    await createSession(result.user.id);
    return Response.json({ user: publicUser(result.user), signedIn: true, returnTo: safeReturnTo(body.returnTo) });
  } catch {
    return Response.json({ error: "Verifikasi gagal. Coba kembali." }, { status: 500 });
  }
}
