import { getAdminUser } from "../../../../lib/auth";
import { createSampleRequests, listSampleRequests, updateSampleRequest } from "../../../../lib/requests";
import { cleanText, sameOrigin } from "../../../../lib/security";
import type { SampleStatus } from "../../../../lib/models";
import { recordAudit } from "../../../../lib/audit";
import { isMutationConflict } from "../../../../lib/mutation";
import { getJson, key } from "../../../../lib/redis";
import type { TapUser } from "../../../../lib/models";

const statuses: SampleStatus[] = ["submitted", "review", "approved", "rejected", "on_hold", "shipped", "received", "content_submitted"];
async function admin() { return getAdminUser(); }

export async function GET(request: Request) {
  if (!(await admin())) return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const result = await listSampleRequests({
    offset: (page - 1) * limit,
    limit,
    q: cleanText(params.get("q"), 100),
    status: cleanText(params.get("status"), 30) || undefined,
    pic: cleanText(params.get("pic"), 80) || undefined,
    year: cleanText(params.get("year"), 4) || undefined,
  });
  return Response.json({ requests: result.items, pagination: { page, limit, total: result.total, pages: Math.max(1, Math.ceil(result.total / limit)) } }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const actor = await admin();
  if (!sameOrigin(request) || !actor) return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json();
  const userId = cleanText(body.userId, 80);
  const creator = await getJson<TapUser>(key("user", userId));
  const brands: string[] = Array.isArray(body.brands)
    ? [...new Set<string>((body.brands as unknown[]).map((brand) => cleanText(brand, 100)).filter((brand): brand is string => Boolean(brand)))].slice(0, 20)
    : [];
  const username = cleanText(body.username, 80).replace(/^@/, "");
  const recipientName = cleanText(body.recipientName, 100);
  const phone = cleanText(body.phone, 30);
  const address = cleanText(body.address, 500);
  if (!creator || creator.role !== "creator" || !brands.length || !username || !recipientName || phone.replace(/\D/g, "").length < 9 || address.length < 12) {
    return Response.json({ error: "Lengkapi creator, brand, penerima, nomor WhatsApp, dan alamat." }, { status: 400 });
  }
  const platform = ["TikTok", "Shopee", "Instagram"].includes(body.platform) ? body.platform : "TikTok";
  const sow = ["VT", "Live", "Live + VT"].includes(body.sow) ? body.sow : undefined;
  const picName = cleanText(body.picName, 80);
  const picPhone = cleanText(body.picPhone, 30);
  const profileUrl = platform === "TikTok" ? `https://www.tiktok.com/@${username}` : cleanText(body.profileUrl, 300);
  const requests = await createSampleRequests(brands.map((brand) => ({
    userId,
    brand,
    platform,
    username,
    profileUrl,
    recipientName,
    phone,
    address,
    commitment: true,
    sow,
    followers: Number(body.followers) || creator.followers || 0,
    gmv: Number(body.gmv) || creator.gmv || 0,
    preferredSample: cleanText(body.preferredSample, 160),
    picName,
    picPhone,
  })));
  await recordAudit({ actorId: actor.id, action: "sample.create_batch", targetId: requests[0]?.requestGroupId || requests[0]?.id, after: { count: requests.length, brands } });
  return Response.json({ requests }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await admin();
  if (!sameOrigin(request) || !actor) return Response.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json();
  const id = cleanText(body.id, 80);
  const status = cleanText(body.status, 30) as SampleStatus;
  if (!id || !statuses.includes(status)) return Response.json({ error: "Data tidak valid." }, { status: 400 });
  try {
    const existing = await getJson<import("../../../../lib/models").SampleRequest>(key("sample", id));
    if (!existing) throw new Error("REQUEST_NOT_FOUND");
    const input: Parameters<typeof updateSampleRequest>[1] = { status };
    if (Object.hasOwn(body, "trackingNumber")) input.trackingNumber = cleanText(body.trackingNumber, 100);
    if (Object.hasOwn(body, "adminNote")) input.adminNote = cleanText(body.adminNote, 500);
    if (Object.hasOwn(body, "picName")) input.picName = cleanText(body.picName, 80);
    if (Object.hasOwn(body, "picPhone")) input.picPhone = cleanText(body.picPhone, 30);
    const updated = await updateSampleRequest(id, input);
    const auditFields = (item: typeof updated) => ({ status:item.status,trackingNumber:item.trackingNumber||"",adminNote:item.adminNote||"",picName:item.picName||"",picPhone:item.picPhone||"" });
    await recordAudit({actorId:actor.id,action:"sample.status",targetId:id,before:auditFields(existing),after:auditFields(updated)});
    return Response.json({ request: updated });
  }
  catch (error) {
    if (isMutationConflict(error)) return Response.json({ error: "Request sedang diperbarui admin lain. Coba lagi." }, { status: 409 });
    return Response.json({ error: error instanceof Error&&error.message==="INVALID_STATUS_TRANSITION"?"Perpindahan status tidak valid.":"Request tidak ditemukan." }, { status: error instanceof Error&&error.message==="INVALID_STATUS_TRANSITION"?409:404 });
  }
}
