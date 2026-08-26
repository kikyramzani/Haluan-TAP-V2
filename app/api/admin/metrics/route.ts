import { getAdminUser } from "../../../../lib/auth";
import { clickMetrics } from "../../../../lib/events";

export async function GET() {
  try {
    if (!(await getAdminUser())) return Response.json({ error: "Akses ditolak." }, { status: 403 });
    return Response.json(await clickMetrics(), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Metrik belum tersedia." }, { status: 503 });
  }
}
