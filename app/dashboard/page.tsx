import Link from "next/link";
import { requireUser } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { computeProfileCompleteness } from "../../lib/profile-completeness";
import { scoreCampaignForCreator, topQuartileThreshold } from "../../lib/recommendation";
import { campaignCommissionLabel, minMaxCommission } from "../../lib/commission-display";

const RECOMMENDATION_COUNT = 4;
const ENDING_SOON_DAYS_WINDOW = 60; // only bother computing "days until end" for campaigns ending reasonably soon

export default async function CreatorDashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser("/dashboard");

  const creator = await prisma.creator.findUniqueOrThrow({
    where: { userId: user.id },
    include: { address: true, categories: true },
  });

  const [campaignActiveCount, sampleRequestCount, sampleApprovedCount, savedCampaignCount] = await Promise.all([
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.sampleRequest.count({ where: { creatorId: creator.id } }),
    prisma.sampleRequest.count({ where: { creatorId: creator.id, status: { in: ["APPROVED", "SHIPPED", "COMPLETED"] } } }),
    prisma.savedCampaign.count({ where: { creatorId: creator.id } }),
  ]);

  const completeness = computeProfileCompleteness({
    name: user.name,
    phone: user.phone,
    provinceId: creator.address?.provinceId,
    regencyId: creator.address?.regencyId,
    districtId: creator.address?.districtId,
    villageId: creator.address?.villageId,
    detailAddress: creator.address?.detailAddress,
    postalCode: creator.address?.postalCode,
    recipientPhone: creator.address?.recipientPhone,
  });

  const recommendations = await buildRecommendations(creator.id, creator.categories.map((c) => c.categoryId));

  const membershipLabel = user.membership === "verified" ? "MCN terverifikasi" : user.membership === "rejected" ? "Verifikasi perlu diperbaiki" : user.membership === "suspended" ? "Akun ditangguhkan" : "Menunggu verifikasi MCN";

  return (
    <>
      {error === "membership_pending" ? (
        <div className="dashboard-alert" role="alert">
          <b>Request sample belum dapat diajukan.</b>
          <span>Link etalase tetap dapat dibuka. Lengkapi profil agar tim dapat memverifikasi akunmu untuk request sample.</span>
          <Link href="/dashboard/profil">Lengkapi profil →</Link>
        </div>
      ) : null}
      {error === "forbidden" ? (
        <div className="dashboard-alert" role="alert">
          <b>Akses admin tidak tersedia.</b>
          <span>Akun ini terdaftar sebagai creator.</span>
        </div>
      ) : null}

      <header className="dashboard-welcome">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> Creator dashboard
          </span>
          <h1>
            Halo, <em>{user.name.split(" ")[0]}.</em>
          </h1>
          <p>Satu tempat untuk membuka extra commission, mengajukan sample, dan memantau aktivitas affiliate kamu.</p>
        </div>
        <Link href="/deals">
          Lihat deal aktif <span>↗</span>
        </Link>
      </header>

      <div className={`activation-card ${user.membership === "verified" ? "verified" : ""}`}>
        <div className="activation-score">
          {completeness.percent}
          <small>%</small>
        </div>
        <div>
          <span>{membershipLabel.toUpperCase()}</span>
          <h2>{user.membership === "verified" ? "Akunmu siap untuk request sample." : "Lengkapi profil untuk mempercepat verifikasi."}</h2>
          <p>{completeness.complete ? "Profil sudah lengkap. Tim Haluan akan memverifikasi keanggotaan MCN kamu." : `Masih perlu: ${completeness.missingFields.join(", ")}.`}</p>
        </div>
        <Link href="/dashboard/profil">{completeness.percent === 100 ? "Perbarui profil" : "Lengkapi sekarang"} →</Link>
      </div>

      <section className="admin-stats" aria-label="Statistik akun">
        <article>
          <span>Campaign Aktif</span>
          <strong>{campaignActiveCount}</strong>
        </article>
        <article>
          <span>Sample Request</span>
          <strong>{sampleRequestCount}</strong>
        </article>
        <article>
          <span>Sample Approved</span>
          <strong>{sampleApprovedCount}</strong>
        </article>
        <article>
          <span>Saved Campaign</span>
          <strong>{savedCampaignCount}</strong>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>UNTUK KAMU</span>
            <h2>Deal yang cocok dengan kamu</h2>
          </div>
          <Link href="/deals">Lihat semua ↗</Link>
        </div>
        {recommendations.length ? (
          <div className="deal-grid">
            {recommendations.map((item) => (
              <Link key={item.slug} className="deal-card" href={`/deal/${item.slug}`}>
                <b>{item.brandName}</b>
                <small>
                  {item.categoryName} · {item.platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop"}
                </small>
                <strong>{item.commissionLabel}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <b>Belum ada rekomendasi.</b>
            <p>Lengkapi kategori kontenmu di profil supaya kami bisa mencocokkan deal yang relevan.</p>
          </div>
        )}
      </section>
    </>
  );
}

async function buildRecommendations(creatorId: string, creatorCategoryIds: string[]) {
  const [clickedBrandRows, campaigns] = await Promise.all([
    prisma.linkClick.findMany({ where: { creatorId }, select: { campaign: { select: { brandId: true } } }, distinct: ["campaignId"] }),
    prisma.campaign.findMany({
      where: { status: "ACTIVE" },
      include: { brand: { include: { category: true } }, tiers: true },
    }),
  ]);
  const clickedBrandIds = new Set(clickedBrandRows.map((row) => row.campaign.brandId));

  const allRates = campaigns
    .filter((c) => c.commissionType === "PERSENTASE")
    .flatMap((c) => c.tiers.map((t) => (t.commission === null ? null : Number(t.commission))))
    .filter((rate): rate is number => rate !== null);
  const threshold = topQuartileThreshold(allRates);

  const now = Date.now();
  const scored = campaigns.map((campaign) => {
    const { min: minCommission } = minMaxCommission(campaign.tiers);
    const daysUntilEnd = campaign.validUntil ? Math.round((campaign.validUntil.getTime() - now) / 86_400_000) : null;
    const score = scoreCampaignForCreator({
      categoryMatches: Boolean(campaign.brand.categoryId && creatorCategoryIds.includes(campaign.brand.categoryId)),
      brandPreviouslyClicked: clickedBrandIds.has(campaign.brandId),
      hasSample: campaign.hasSample,
      isTopQuartileCommission: threshold !== null && minCommission !== null && minCommission >= threshold,
      daysUntilEnd: daysUntilEnd !== null && daysUntilEnd <= ENDING_SOON_DAYS_WINDOW ? daysUntilEnd : null,
    });
    return {
      slug: campaign.slug,
      brandName: campaign.brand.displayName,
      categoryName: campaign.brand.category?.name ?? "Lainnya",
      platform: campaign.platform,
      commissionLabel: campaignCommissionLabel({ commissionType: campaign.commissionType, commission: minCommission }),
      score,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, RECOMMENDATION_COUNT);
}
