import { getCurrentUser, publicUser, updateProfile } from "../../../lib/auth";
import { cleanText, sameOrigin } from "../../../lib/security";
import type { TapUser } from "../../../lib/models";

type ProfileInput = Partial<Pick<TapUser, "name" | "phone" | "tiktokUsername" | "shopeeUsername" | "niche" | "followers" | "gmv" | "recipientName" | "address">>;

/**
 * A PATCH must leave untouched fields untouched. Writing every field on every
 * call turns a partial update into an erase: sending only `recipientName` used
 * to blank the phone, niche, address, username, and followers.
 */
function readProfileInput(body: Record<string, unknown>): ProfileInput {
  const input: ProfileInput = {};
  if (Object.hasOwn(body, "name")) {
    const name = cleanText(body.name, 80);
    if (name) input.name = name;
  }
  if (Object.hasOwn(body, "phone")) input.phone = cleanText(body.phone, 24);
  if (Object.hasOwn(body, "tiktokUsername")) input.tiktokUsername = cleanText(body.tiktokUsername, 80).replace(/^@/, "");
  if (Object.hasOwn(body, "shopeeUsername")) input.shopeeUsername = cleanText(body.shopeeUsername, 80).replace(/^@/, "");
  if (Object.hasOwn(body, "niche")) input.niche = cleanText(body.niche, 80);
  if (Object.hasOwn(body, "followers")) input.followers = Math.max(0, Math.min(1_000_000_000, Number(body.followers) || 0));
  if (Object.hasOwn(body, "gmv")) input.gmv = Math.max(0, Math.min(1_000_000_000_000, Number(body.gmv) || 0));
  if (Object.hasOwn(body, "recipientName")) input.recipientName = cleanText(body.recipientName, 100);
  if (Object.hasOwn(body, "address")) input.address = cleanText(body.address, 500);
  return input;
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Silakan masuk kembali." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const updated = await updateProfile(user.id, readProfileInput(body));
    return Response.json({ user: publicUser(updated) });
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_EXISTS") return Response.json({ error: "Nomor WhatsApp tersebut sudah dipakai akun lain." }, { status: 409 });
    // The session authenticated against a record that is no longer there. That is
    // a missing account, not a failed save, and the difference decides whether the
    // visitor should retry or sign in again.
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return Response.json({ error: "Akun tidak ditemukan. Silakan masuk kembali." }, { status: 404 });
    return Response.json({ error: "Profil gagal disimpan." }, { status: 500 });
  }
}
