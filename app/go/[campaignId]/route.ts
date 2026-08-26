import { getCurrentUser } from "../../../lib/auth";
import { getPrimaryTapLink } from "../../../lib/campaign-links";
import { recordClick } from "../../../lib/events";

/**
 * Pengalih ke etalase brand.
 *
 * Tidak ada lagi parameter `variant`. Satu brand hanya punya satu link yang
 * ditawarkan — tier dengan komisi terkecil — dan link itu diselesaikan di sini,
 * bukan dititipkan lewat URL. Ini juga memperbaiki link lama yang sudah beredar
 * dengan `?variant=` di dalamnya: sebelumnya nilai di luar jangkauan dijepit ke
 * link terakhir, sehingga creator bisa mendarat di tier yang tidak pernah
 * ditampilkan di kartu.
 */
export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const url = new URL(request.url);
  const { campaignId } = await context.params;
  let user = null;
  try { user = await getCurrentUser(); } catch { user = null; }
  try {
    const deal = await getPrimaryTapLink(campaignId);
    if (!deal) return Response.redirect(new URL("/deals?error=deal_unavailable", url.origin));
    try {
      await recordClick({
        userId: user?.id ?? "anonymous",
        campaignId,
        referrer: request.headers.get("referer")?.slice(0, 300),
        userAgent: request.headers.get("user-agent")?.slice(0, 300),
      });
    } catch { /* Click tracking tidak boleh menghalangi creator membuka etalase. */ }
    return Response.redirect(deal.url, 302);
  } catch { return Response.redirect(new URL("/deals?error=system_unavailable", url.origin)); }
}
