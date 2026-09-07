import { getCurrentUser } from "../../../lib/auth";
import { checkRateLimit } from "../../../lib/rate-limit";
import { createSampleRequest, listUserSampleRequests } from "../../../lib/requests";
import { cleanText, clientIp, sameOrigin } from "../../../lib/security";
import { hashIp } from "../../../lib/hash-ip";
import { SAMPLE_GATE_MESSAGES } from "../../../lib/sample-gate";
import { composeShippingFromProfile } from "../../../lib/shipping-profile";
import { evaluateSampleGate } from "./gate-check";

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
    // 5 per 5 minutes per account+IP. A burst guard, not a daily quota (the
    // doc's target; the old 5/day limit was a much looser stand-in).
    const rate = await checkRateLimit("sample", `${user.id}:${hashIp(clientIp(request))}`, 5, 300);
    if (!rate.allowed) return Response.json({ error: "Terlalu banyak request sample dalam waktu singkat. Coba lagi sebentar lagi." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } });
    const body = await request.json();
    const brand = cleanText(body.brand, 100);
    const platform = cleanText(body.platform, 30);
    const username = cleanText(body.username, 80).replace(/^@/, "");
    const profileUrl = cleanText(body.profileUrl, 300);
    const commitment = body.commitment === true;
    if (!brand || !["TikTok", "Shopee", "Instagram"].includes(platform) || !username || !/^https:\/\//i.test(profileUrl) || !commitment) {
      return Response.json({ error: "Lengkapi seluruh data request dengan benar." }, { status: 400 });
    }
    // Never trust a client-side pre-check alone (see /api/sample-requests/gate) -
    // the full 5-reason gate is re-evaluated here, server-side, right before the
    // row is created. PROFILE_INCOMPLETE diperiksa paling awal di dalamnya.
    const { result } = await evaluateSampleGate(user, brand, platform);
    if (!result.allowed) return Response.json({ error: SAMPLE_GATE_MESSAGES[result.reason] }, { status: 409 });
    /**
     * Penerima, nomor, dan alamat DISUSUN DARI PROFIL — apa pun yang klien
     * kirim untuk ketiganya diabaikan. Gerbang di atas sudah menjamin profilnya
     * lengkap; null di sini hanya pengaman kedua. Lihat lib/shipping-profile.ts.
     */
    const shipping = composeShippingFromProfile(user);
    if (!shipping) return Response.json({ error: SAMPLE_GATE_MESSAGES.PROFILE_INCOMPLETE }, { status: 409 });
    const saved = await createSampleRequest({ userId: user.id, brand, platform, username, profileUrl, commitment, ...shipping });
    // Only the id is ever read by the client (app/request-sample/page.tsx) -
    // no reason to hand back the full creator/campaign relation graph.
    return Response.json({ request: { id: saved.id, status: saved.status } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "TAP_DATASTORE_UNAVAILABLE") return Response.json({ error: "Sistem request belum tersambung. Hubungi tim Haluan." }, { status: 503 });
    return Response.json({ error: "Request gagal disimpan." }, { status: 500 });
  }
}
