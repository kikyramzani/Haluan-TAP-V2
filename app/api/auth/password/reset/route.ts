import { createSession, publicUser, resetPasswordWithChallenge } from "../../../../../lib/auth";
import { cleanText, clientIp, sameOrigin, validPassword } from "../../../../../lib/security";
import { checkRateLimit, retryAfterMessage } from "../../../../../lib/rate-limit";
import { hashIp } from "../../../../../lib/hash-ip";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    if (!validPassword(password)) return Response.json({ error: "Gunakan minimal 10 karakter dan satu angka." }, { status: 400 });
    const challengeId = cleanText(body.challengeId, 128);
    const [challengeRate, senderRate] = await Promise.all([
      checkRateLimit("reset-confirm", challengeId || "invalid", 30, 3600),
      checkRateLimit("reset-confirm-ip", hashIp(clientIp(request)), 10, 3600),
    ]);
    const blocked = !senderRate.allowed ? senderRate : !challengeRate.allowed ? challengeRate : null;
    if (blocked) return Response.json({ error: `Terlalu banyak percobaan kode. Coba lagi dalam ${retryAfterMessage(blocked.retryAfterSeconds)}.` }, { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } });
    const result = await resetPasswordWithChallenge(challengeId, cleanText(body.code, 6), password);
    if (result.status === "rejected") return Response.json({ error: "Kode salah atau sudah kedaluwarsa." }, { status: 400 });
    // A reset settles the account's claims too, so it can be refused for the same
    // reason a verification can: the address or the number now belongs to another
    // account. Nothing was written, the code is untouched, and no session is
    // issued. The change the caller asked for did not happen.
    if (result.status === "claim_conflict") {
      const detail = result.claim === "phone"
        ? "Nomor WhatsApp di akun ini sudah dipakai akun lain."
        : "Email ini sudah dipakai akun lain.";
      return Response.json({ error: `${detail} Hubungi tim Haluan supaya kami bisa merapikannya.` }, { status: 409 });
    }
    // This exact reset already landed. The retry is answered, not authenticated:
    // a spent code must not mint a second session, and the password it set is the
    // one the owner signs in with.
    if (result.status === "acknowledged") {
      return Response.json({ reset: true, signedIn: false, notice: "Kata sandi kamu sudah diganti. Masuk dengan kata sandi baru." });
    }
    await createSession(result.user.id);
    return Response.json({ user: publicUser(result.user), signedIn: true, returnTo: "/dashboard" });
  } catch {
    return Response.json({ error: "Kata sandi belum dapat diubah. Coba kembali." }, { status: 500 });
  }
}
