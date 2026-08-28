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
    if (!endpoint) return Response.json({ error: "Endpoint langganan tidak valid." }, { status: 400 });

    // Scoped to the acting user as well as the endpoint, so a subscription
    // cannot be deleted by anyone other than the account that owns it.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Langganan push gagal dihentikan." }, { status: 500 });
  }
}
