import { getAdminUser, listUsers, publicUser, updateMembership } from "../../../../lib/auth";
import { cleanText, sameOrigin } from "../../../../lib/security";
import { recordAudit } from "../../../../lib/audit";
import { isMutationConflict } from "../../../../lib/mutation";
import { getJson, key } from "../../../../lib/redis";
import type { TapUser } from "../../../../lib/models";

async function admin() { return getAdminUser(); }

export async function GET(request: Request) {
  if (!(await admin())) return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const result = await listUsers({ offset: (page - 1) * limit, limit, q: cleanText(params.get("q"), 100), role: "creator" });
  return Response.json({ users: result.items.map(publicUser), pagination: { page, limit, total: result.total, pages: Math.max(1, Math.ceil(result.total / limit)) } }, { headers: { "cache-control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const actor = await admin();
  if (!sameOrigin(request) || !actor) return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json();
  const userId = cleanText(body.userId, 80);
  const membership = cleanText(body.membership, 20);
  if (!userId || !["pending", "verified", "rejected"].includes(membership)) return Response.json({ error: "Data tidak valid." }, { status: 400 });
  try { const existing=await getJson<TapUser>(key("user",userId));const updated=await updateMembership(userId, membership as "pending" | "verified" | "rejected");await recordAudit({actorId:actor.id,action:"membership.update",targetId:userId,before:{membership:existing?.membership??null},after:{membership}});return Response.json({ user: publicUser(updated) }); }
  catch (error) {
    if (isMutationConflict(error)) return Response.json({ error: "Creator sedang diperbarui admin lain. Coba lagi." }, { status: 409 });
    // Only a missing record is a 404. Answering "creator tidak ditemukan" to a
    // datastore failure sends the admin looking for an account that is right
    // there, and hides an outage behind a data error.
    const message = error instanceof Error ? error.message : "";
    if (message === "USER_NOT_FOUND") return Response.json({ error: "Creator tidak ditemukan." }, { status: 404 });
    if (message === "TAP_DATASTORE_UNAVAILABLE") return Response.json({ error: "Sistem akun sedang tidak tersedia. Coba lagi beberapa saat lagi." }, { status: 503 });
    return Response.json({ error: "Status membership belum dapat diubah. Coba kembali." }, { status: 500 });
  }
}
