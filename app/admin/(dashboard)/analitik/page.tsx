import { prisma } from "../../../../lib/db";
import { conversionRatePct } from "../../../../lib/site-conversion-rate";

/**
 * Read-only 30-day performance view: clicks, sample requests, top
 * campaigns/creators, platform split, and a click → sample → approved
 * funnel. Gated by requireAdmin() in app/admin/layout.tsx. No mutations
 * happen on this page.
 */

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const TREND_DAY_MS = 1000 * 60 * 60 * 24;
const APPROVED_SAMPLE_STATUSES = ["APPROVED", "SHIPPED", "COMPLETED"] as const;
const PLATFORM_LABELS: Record<string, string> = { TIKTOK_SHOP: "TikTok Shop", SHOPEE_AFFILIATE: "Shopee Affiliate" };

type DailyClickRow = { day: Date; count: number };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(date);
}

function barPercent(value: number, max: number): string {
  return `${max > 0 ? (value / max) * 100 : 0}%`;
}

export default async function AdminAnalitikPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const createdAtWindow = { gte: thirtyDaysAgo };

  const [
    totalClicks,
    totalSampleRequests,
    activeCreatorRows,
    dailyRows,
    topCampaignGroups,
    topCreatorGroups,
    tiktokClicks,
    shopeeClicks,
    approvedSamples,
  ] = await Promise.all([
    prisma.linkClick.count({ where: { createdAt: createdAtWindow } }),
    prisma.sampleRequest.count({ where: { createdAt: createdAtWindow } }),
    prisma.linkClick.findMany({
      where: { createdAt: createdAtWindow, creatorId: { not: null } },
      distinct: ["creatorId"],
      select: { creatorId: true },
    }),
    prisma.$queryRaw<DailyClickRow[]>`
      SELECT date_trunc('day', "createdAt") as day, count(*)::int as count
      FROM "LinkClick"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day
    `,
    prisma.linkClick.groupBy({
      by: ["campaignId"],
      where: { createdAt: createdAtWindow },
      _count: { campaignId: true },
      orderBy: { _count: { campaignId: "desc" } },
      take: 10,
    }),
    prisma.linkClick.groupBy({
      by: ["creatorId"],
      where: { createdAt: createdAtWindow, creatorId: { not: null } },
      _count: { creatorId: true },
      orderBy: { _count: { creatorId: "desc" } },
      take: 10,
    }),
    prisma.linkClick.count({ where: { createdAt: createdAtWindow, campaign: { platform: "TIKTOK_SHOP" } } }),
    prisma.linkClick.count({ where: { createdAt: createdAtWindow, campaign: { platform: "SHOPEE_AFFILIATE" } } }),
    prisma.sampleRequest.count({
      where: { createdAt: createdAtWindow, status: { in: [...APPROVED_SAMPLE_STATUSES] } },
    }),
  ]);

  const [campaignRows, creatorRows] = await Promise.all([
    prisma.campaign.findMany({
      where: { id: { in: topCampaignGroups.map((group) => group.campaignId) } },
      include: { brand: true },
    }),
    prisma.creator.findMany({
      where: {
        id: {
          in: topCreatorGroups.map((group) => group.creatorId).filter((id): id is string => id !== null),
        },
      },
      include: { user: true },
    }),
  ]);

  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));
  const creatorById = new Map(creatorRows.map((creator) => [creator.id, creator]));

  const activeCreatorCount = activeCreatorRows.length;
  const conversionRate = conversionRatePct(totalClicks, totalSampleRequests);

  const topCampaigns = topCampaignGroups.map((group) => {
    const campaign = campaignById.get(group.campaignId);
    return {
      id: group.campaignId,
      label: campaign?.brand.displayName ?? campaign?.slug ?? "Campaign dihapus",
      clicks: group._count.campaignId,
    };
  });
  const maxCampaignClicks = Math.max(1, ...topCampaigns.map((campaign) => campaign.clicks));

  const topCreators = topCreatorGroups.map((group) => {
    const creator = group.creatorId ? creatorById.get(group.creatorId) : undefined;
    const label = creator?.tiktokUsername
      ? `@${creator.tiktokUsername}`
      : creator?.shopeeUsername
        ? `@${creator.shopeeUsername}`
        : (creator?.user.name ?? "Kreator dihapus");
    return { id: group.creatorId ?? group._count.creatorId, label, clicks: group._count.creatorId };
  });
  const maxCreatorClicks = Math.max(1, ...topCreators.map((creator) => creator.clicks));

  const maxPlatformClicks = Math.max(1, tiktokClicks, shopeeClicks);

  const dailyByDate = new Map(dailyRows.map((row) => [startOfUtcDay(new Date(row.day)).getTime(), row.count]));
  const trendDays = Array.from({ length: 30 }, (_, index) => {
    const day = startOfUtcDay(new Date(thirtyDaysAgo.getTime() + index * TREND_DAY_MS));
    return { day, count: dailyByDate.get(day.getTime()) ?? 0 };
  });
  const maxDailyClicks = Math.max(1, ...trendDays.map((entry) => entry.count));

  const funnelStages = [
    { label: "Klik", value: totalClicks },
    { label: "Request sample", value: totalSampleRequests },
    { label: "Sample disetujui", value: approvedSamples },
  ];
  const maxFunnelValue = Math.max(1, ...funnelStages.map((stage) => stage.value));

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>ANALITIK</span>
          <h1>Performa 30 hari terakhir</h1>
        </div>
      </div>

      <section className="admin-stats">
        <article>
          <span>TOTAL KLIK</span>
          <strong>{formatNumber(totalClicks)}</strong>
          <small>30 hari terakhir</small>
        </article>
        <article>
          <span>TOTAL REQUEST SAMPLE</span>
          <strong>{formatNumber(totalSampleRequests)}</strong>
          <small>30 hari terakhir</small>
        </article>
        <article>
          <span>KREATOR AKTIF</span>
          <strong>{formatNumber(activeCreatorCount)}</strong>
          <small>klik dari kreator unik</small>
        </article>
        <article>
          <span>KONVERSI KLIK KE SAMPLE</span>
          <strong>{conversionRate === null ? "—" : `${conversionRate.toFixed(1)}%`}</strong>
          <small>request / klik</small>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>TREN HARIAN</span>
            <h2>Klik per hari</h2>
          </div>
        </div>
        <div className="analitik-trend" role="img" aria-label="Grafik batang jumlah klik harian selama 30 hari terakhir">
          {trendDays.map((entry) => (
            <div
              className="analitik-trend-bar"
              key={entry.day.getTime()}
              title={`${formatDay(entry.day)}: ${formatNumber(entry.count)} klik`}
            >
              <em style={{ height: barPercent(entry.count, maxDailyClicks) }} />
            </div>
          ))}
        </div>
      </section>

      <div className="admin-overview-panels">
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <span>TOP CAMPAIGN</span>
              <h2>Klik terbanyak</h2>
            </div>
          </div>
          {topCampaigns.length ? (
            topCampaigns.map((campaign) => (
              <div className="metric-line" key={campaign.id}>
                <b>{campaign.label}</b>
                <i>
                  <em style={{ width: barPercent(campaign.clicks, maxCampaignClicks) }} />
                </i>
                <strong>{formatNumber(campaign.clicks)}</strong>
              </div>
            ))
          ) : (
            <p className="admin-panel-empty">Belum ada klik pada periode ini.</p>
          )}
        </section>

        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <span>TOP KREATOR</span>
              <h2>Klik terbanyak</h2>
            </div>
          </div>
          {topCreators.length ? (
            topCreators.map((creator) => (
              <div className="metric-line" key={creator.id}>
                <b>{creator.label}</b>
                <i>
                  <em style={{ width: barPercent(creator.clicks, maxCreatorClicks) }} />
                </i>
                <strong>{formatNumber(creator.clicks)}</strong>
              </div>
            ))
          ) : (
            <p className="admin-panel-empty">Belum ada klik dari kreator pada periode ini.</p>
          )}
        </section>
      </div>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>PLATFORM</span>
            <h2>TikTok Shop vs Shopee Affiliate</h2>
          </div>
        </div>
        <div className="metric-line">
          <b>{PLATFORM_LABELS.TIKTOK_SHOP}</b>
          <i>
            <em style={{ width: barPercent(tiktokClicks, maxPlatformClicks) }} />
          </i>
          <strong>{formatNumber(tiktokClicks)}</strong>
        </div>
        <div className="metric-line">
          <b>{PLATFORM_LABELS.SHOPEE_AFFILIATE}</b>
          <i>
            <em style={{ width: barPercent(shopeeClicks, maxPlatformClicks) }} />
          </i>
          <strong>{formatNumber(shopeeClicks)}</strong>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>FUNNEL</span>
            <h2>Klik, Request, Approved</h2>
          </div>
        </div>
        {funnelStages.map((stage) => (
          <div className="metric-line" key={stage.label}>
            <b>{stage.label}</b>
            <i>
              <em style={{ width: barPercent(stage.value, maxFunnelValue) }} />
            </i>
            <strong>{formatNumber(stage.value)}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
