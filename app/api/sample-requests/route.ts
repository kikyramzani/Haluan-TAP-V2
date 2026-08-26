import { getCurrentUser } from "../../../lib/auth";
import { checkRateLimit } from "../../../lib/rate-limit";
import { createSampleRequest, listUserSampleRequests } from "../../../lib/requests";
import { cleanText, clientIp, sameOrigin } from "../../../lib/security";
import { isSampleAvailable } from "../../../lib/campaign-links";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Silakan masuk kembali." }, { status: 401 });
    return Response.json({ requests: await listUserSampleRequests(user.id) }, { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Data request belum tersedia." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Masuk sebagai creator untuk mengajukan sample." }, { status: 401 });
    if (user.membership !== "verified") return Response.json({ error: "Keanggotaan MCN kamu masih menunggu verifikasi." }, { status: 403 });
    const rate = await checkRateLimit("sample", `${user.id}:${clientIp(request)}`, 5, 86400);
    if (!rate.allowed) return Response.json({ error: "Batas request harian tercapai." }, { status: 429 });
    const body = await request.json();
    const input = {
      userId: user.id,
      brand: cleanText(body.brand, 100),
      platform: cleanText(body.platform, 30),
      username: cleanText(body.username, 80).replace(/^@/, ""),
      profileUrl: cleanText(body.profileUrl, 300),
      recipientName: cleanText(body.recipientName, 100),
      phone: cleanText(body.phone, 24),
      address: cleanText(body.address, 500),
      commitment: body.commitment === true,
    };
    if (!input.brand || !["TikTok", "Shopee", "Instagram"].includes(input.platform) || !input.username || !/^https:\/\//i.test(input.profileUrl) || !input.recipientName || input.phone.replace(/\D/g, "").length < 9 || input.address.length < 12 || !input.commitment) {
      return Response.json({ error: "Lengkapi seluruh data request dengan benar." }, { status: 400 });
    }
    if (!(await isSampleAvailable(input.brand, input.platform))) return Response.json({error:"Campaign ini tidak memiliki sample aktif."},{status:409});
    const saved = await createSampleRequest(input);
    return Response.json({ request: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "TAP_DATASTORE_UNAVAILABLE") return Response.json({ error: "Sistem request belum tersambung. Hubungi tim Haluan." }, { status: 503 });
    return Response.json({ error: "Request gagal disimpan." }, { status: 500 });
  }
}
