import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { cleanText, sameOrigin } from "../../../../lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Silakan masuk kembali." }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const endpoint = cleanText(body.endpoint, 500);
    const p256dh = cleanText(body.p256dh, 300);
    const auth = cleanText(body.auth, 300);
    if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) {
      return Response.json({ error: "Data langganan push tidak lengkap." }, { status: 400 });
    }

    // `endpoint` is globally unique. A browser re-subscribing (e.g. after
    // clearing its push registration) lands on the same row instead of a
    // duplicate, and re-points it at whichever account enabled it this time.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userId: user.id },
      update: { userId: user.id, p256dh, auth },
    });
    return Response.json({ success: true }, { status: 201 });
  } catch {
    return Response.json({ error: "Langganan push gagal disimpan." }, { status: 500 });
  }
}
