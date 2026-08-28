import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";

/**
 * Read-only performance view scoped to the signed-in creator's own clicks:
 * direct vs. referred (via ?ref=), top campaigns by click count, and a
 * recent-clicks table. Same read-only shape as /admin/analitik, just
 * filtered to one creator instead of the whole platform — no mutations
 * happen here.
 */

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function PerformaPage() {
  const user = await requireUser("/dashboard/performa");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { userId: user.id } });

  const [directClicks, referredClicks, topCampaignGroups, recentClicks] = await Promise.all([
    prisma.linkClick.count({ where: { creatorId: creator.id, refCode: null } }),
    prisma.linkClick.count({ where: { creatorId: creator.id, refCode: { not: null } } }),
    prisma.linkClick.groupBy({
      by: ["campaignId"],
      where: { creatorId: creator.id },
      _count: { campaignId: true },
      orderBy: { _count: { campaignId: "desc" } },
      take: 10,
    }),
    prisma.linkClick.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { campaign: { include: { brand: true } } },
    }),
  ]);

  const campaignRows = await prisma.campaign.findMany({
    where: { id: { in: topCampaignGroups.map((group) => group.campaignId) } },
    include: { brand: true },
  });
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));

  const topCampaigns = topCampaignGroups.map((group) => {
    const campaign = campaignById.get(group.campaignId);
    return {
      id: group.campaignId,
      label: campaign?.brand.displayName ?? "Campaign dihapus",
      clicks: group._count.campaignId,
    };
  });

  return (
    <>
      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>PERFORMA</span>
            <h2>Klik link kamu</h2>
          </div>
        </div>

        <section className="admin-stats" aria-label="Ringkasan klik">
          <article>
            <span>Klik langsung</span>
            <strong>{formatNumber(directClicks)}</strong>
          </article>
          <article>
            <span>Klik dari link dibagikan</span>
            <strong>{formatNumber(referredClicks)}</strong>
          </article>
        </section>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>TOP CAMPAIGN</span>
            <h2>Paling banyak diklik</h2>
          </div>
        </div>
        {topCampaigns.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Klik</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.label}</td>
                    <td className="numeric">{formatNumber(campaign.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-empty">
            <b>Belum ada klik.</b>
            <p>Bagikan link campaign kamu untuk mulai memantau performa.</p>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>AKTIVITAS TERBARU</span>
            <h2>Klik terbaru</h2>
          </div>
        </div>
        {recentClicks.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Sumber</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {recentClicks.map((click) => (
                  <tr key={click.id}>
                    <td>{click.campaign.brand.displayName}</td>
                    <td>{click.refCode ? `Dibagikan (${click.refCode})` : "Langsung"}</td>
                    <td>{formatDateTime(click.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-empty">
            <b>Belum ada aktivitas klik.</b>
          </div>
        )}
      </section>
    </>
  );
}
