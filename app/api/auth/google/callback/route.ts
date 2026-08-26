import { cookies } from "next/headers";
import { createSession, upsertGoogleUser } from "../../../../../lib/auth";
import { safeReturnTo } from "../../../../../lib/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const rawState = jar.get("tap_oauth_state")?.value;
  jar.delete("tap_oauth_state");
  let stored: { state: string; returnTo: string } | null = null;
  try { stored = rawState ? JSON.parse(rawState) : null; } catch { stored = null; }
  if (!stored || stored.state !== url.searchParams.get("state")) return Response.redirect(new URL("/daftar?error=oauth_state", url.origin));
  const code = url.searchParams.get("code");
  if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return Response.redirect(new URL("/daftar?error=google_unavailable", url.origin));
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/api/auth/google/callback`, grant_type: "authorization_code" }) });
    if (!tokenResponse.ok) throw new Error("TOKEN_EXCHANGE_FAILED");
    const token = await tokenResponse.json() as { access_token: string };
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const profile = await profileResponse.json() as { email?: string; email_verified?: boolean; name?: string };
    if (!profile.email || !profile.email_verified) throw new Error("EMAIL_NOT_VERIFIED");
    const user = await upsertGoogleUser({ email: profile.email, name: profile.name ?? profile.email.split("@")[0] });
    await createSession(user.id);
    return Response.redirect(new URL(safeReturnTo(stored.returnTo), url.origin));
  } catch { return Response.redirect(new URL("/daftar?error=oauth_failed", url.origin)); }
}
