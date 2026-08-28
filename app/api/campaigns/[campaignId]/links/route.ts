import { pickPrimaryLink } from "@/lib/campaign-links";
import { getTapLinks } from "@/lib/catalog-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { hashIp } from "@/lib/hash-ip";

export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  // Link etalase memang publik dan tetap berguna saat penghitung rate limit
  // bermasalah, jadi jalur ini fail-open — sama seperti /api/campaigns. Rute
  // auth dan tulis tetap fail-closed di berkasnya masing-masing.
  try {
    const rate = await checkRateLimit("campaign-links-public", hashIp(clientIp(request)), 120, 300);
    if (!rate.allowed) return Response.json({ error: "Terlalu banyak permintaan." }, { status: 429 });
  } catch {
    // Sengaja diteruskan ke sumber link yang tersedia sendiri.
  }

  const { campaignId } = await context.params;
  if (!/^[a-z0-9-]{1,120}$/.test(campaignId)) {
    return Response.json({ error: "Campaign tidak valid." }, { status: 400 });
  }

  try {
    const links = await getTapLinks(campaignId);
    const primary = pickPrimaryLink(links);
    if (!primary) return Response.json({ error: "Link etalase tidak tersedia." }, { status: 404 });

    // Hanya satu link yang dikembalikan: tier dengan komisi terkecil, angka yang
    // sama dengan yang dijanjikan kartu brand.
    return Response.json(
      {
        brand: primary.brand,
        hasSample: links.some((link) => link.hasSample),
        expiresAt: links.find((link) => link.expiresAt)?.expiresAt ?? null,
        link: {
          label: primary.label,
          url: primary.url,
          commission: primary.commission,
          hasSample: primary.hasSample,
          openUrl: `/go/${campaignId}`,
        },
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Link etalase sedang tidak tersedia." }, { status: 503 });
  }
}
