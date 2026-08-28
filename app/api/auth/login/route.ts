import { createSession, findUserByEmail, publicUser, verifyPassword } from "../../../../lib/auth";
import { checkRateLimit, retryAfterMessage } from "../../../../lib/rate-limit";
import { cleanText, clientIp, sameOrigin, safeReturnTo } from "../../../../lib/security";
import { hashIp } from "../../../../lib/hash-ip";
import { authEmailEnabled, issueVerifyContinuation } from "../../../../lib/email-auth";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
    const body = await request.json();
    const email = cleanText(body.email, 254).toLowerCase();
    const [ipRate, accountRate] = await Promise.all([checkRateLimit("login-ip", hashIp(clientIp(request)), 10, 900), checkRateLimit("login-account", email || "invalid", 8, 900)]);
    const blocked = !ipRate.allowed ? ipRate : !accountRate.allowed ? accountRate : null;
    if (blocked) return Response.json({ error: `Terlalu banyak percobaan login. Coba lagi dalam ${retryAfterMessage(blocked.retryAfterSeconds)}.` }, { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } });
    const password = typeof body.password === "string" ? body.password : "";
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return Response.json({ error: "Email atau kata sandi salah." }, { status: 401 });
    if (authEmailEnabled() && !user.emailVerifiedAt) {
      // The password just checked out against this record, which is proof of which
      // account the verification belongs to — the one thing an email address on
      // its own cannot establish.
      const continuation = await issueVerifyContinuation(user.id);
      return Response.json({ error: "Verifikasi email kamu sebelum masuk.", verificationRequired: true, continuation }, { status: 403 });
    }
    await createSession(user.id);
    return Response.json({ user: publicUser(user), returnTo: safeReturnTo(body.returnTo) });
  } catch (error) {
    if (error instanceof Error && error.message === "TAP_DATASTORE_UNAVAILABLE") return Response.json({ error: "Login sedang disiapkan. Silakan hubungi tim Haluan." }, { status: 503 });
    return Response.json({ error: "Login gagal. Coba kembali." }, { status: 500 });
  }
}
