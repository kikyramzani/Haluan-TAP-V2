import { getCurrentUser } from "../../../../lib/auth";
import { cleanText } from "../../../../lib/security";
import { SAMPLE_GATE_MESSAGES } from "../../../../lib/sample-gate";
import { evaluateSampleGate } from "../gate-check";

/**
 * Proactive pre-check for /request-sample: called once a campaign is picked
 * from the datalist, so the creator sees why they can't request before they
 * fill out the whole form — not just after submitting. This is a convenience
 * only; the POST handler below re-runs the same evaluateSampleGate() at
 * actual submission, which is what's actually enforced.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const brand = cleanText(searchParams.get("brand"), 100);
  const platform = cleanText(searchParams.get("platform"), 30);
  if (!brand || !platform) return Response.json({ error: "Pilih campaign terlebih dahulu." }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Masuk sebagai creator untuk memeriksa status ini." }, { status: 401 });

  try {
    const { result } = await evaluateSampleGate(user, brand, platform);
    if (result.allowed) return Response.json({ allowed: true }, { headers: { "cache-control": "private, no-store" } });
    return Response.json(
      { allowed: false, reason: result.reason, message: SAMPLE_GATE_MESSAGES[result.reason] },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Gagal memeriksa status campaign." }, { status: 503 });
  }
}
