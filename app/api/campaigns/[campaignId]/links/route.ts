import { pickPrimaryLink } from "@/lib/campaign-links";
import { getTapLinks } from "@/lib/catalog-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { hashIp } from "@/lib/hash-ip";

export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  // Link etalase memang publik dan tetap berguna saat penghitung rate limit
  // bermasalah, jadi jalur ini fail-open. Sama seperti /api/campaigns. Rute
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

    /**
     * Link utama lebih dulu, sisanya menyusul dalam urutan sortIndex. Kartu
     * brand menjanjikan komisi TERENDAH, jadi link yang menepati janji itu
     * harus jadi yang pertama terbaca di bawah judulnya.
     */
    const ordered = [primary, ...links.filter((link) => link !== primary)];

    return Response.json(
      {
        brand: primary.brand,
        hasSample: links.some((link) => link.hasSample),
        expiresAt: links.find((link) => link.expiresAt)?.expiresAt ?? null,
        /**
         * `link` tunggal DIPERTAHANKAN apa adanya: ia sudah jadi kontrak publik
         * dan dipegang tes. Yang baru adalah `links` — dulu campaign dengan
         * tiga tier hanya memunculkan satu linknya, dan dua sisanya tidak punya
         * jalan keluar sama sekali.
         */
        link: {
          label: primary.label,
          url: primary.url,
          commission: primary.commission,
          hasSample: primary.hasSample,
          openUrl: `/go/${campaignId}`,
        },
        links: ordered.map((link) => ({
          id: link.id ?? null,
          label: link.label,
          url: link.url,
          commission: link.commission,
          hasSample: link.hasSample,
          // Link utama tetap memakai /go/<slug> polos: itu bentuk yang sudah
          // beredar dibagikan creator, dan ia memang menunjuk ke tier terendah.
          openUrl: link === primary || !link.id ? `/go/${campaignId}` : `/go/${campaignId}?l=${encodeURIComponent(link.id)}`,
          isPrimary: link === primary,
        })),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Link etalase sedang tidak tersedia." }, { status: 503 });
  }
}
