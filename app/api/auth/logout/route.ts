import { destroySession } from "../../../../lib/auth";
import { sameOrigin } from "../../../../lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origin tidak valid." }, { status: 403 });
  try { await destroySession(); } catch { /* cookie tetap dibersihkan bila datastore bermasalah */ }
  return Response.json({ ok: true });
}
