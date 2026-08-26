import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { safeReturnTo } from "../../../../../lib/security";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = new URL(request.url).origin;
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  if (!clientId) return Response.redirect(new URL(`/daftar?error=google_unavailable&returnTo=${encodeURIComponent(returnTo)}`, origin));
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set("tap_oauth_state", JSON.stringify({ state, returnTo }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${origin}/api/auth/google/callback`, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  return Response.redirect(authorize);
}
