import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { campaignCommissionLabel, minMaxCommission } from "../../../lib/commission-display";
import SavedCampaignCard from "./SavedCampaignCard";

export default async function TersimpanPage() {
  const user = await requireUser("/dashboard/tersimpan");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { userId: user.id } });

  const savedCampaigns = await prisma.savedCampaign.findMany({
    where: { creatorId: creator.id },
    orderBy: { createdAt: "desc" },
    include: { campaign: { include: { brand: { include: { category: true } }, tiers: true } } },
  });

  const items = savedCampaigns.map((saved) => {
    const campaign = saved.campaign;
    const { min } = minMaxCommission(campaign.tiers);
    return {
      savedId: saved.id,
      campaignId: campaign.id,
      slug: campaign.slug,
      brandName: campaign.brand.displayName,
      categoryName: campaign.brand.category?.name ?? "Lainnya",
      platform: campaign.platform,
      commissionLabel: campaignCommissionLabel({ commissionType: campaign.commissionType, commission: min }),
    };
  });

  return (
    <section className="dashboard-section">
      <div className="dashboard-title">
        <div>
          <span>TERSIMPAN</span>
          <h2>Campaign yang kamu simpan</h2>
        </div>
        <Link href="/deals">Lihat semua deal ↗</Link>
      </div>

      {items.length ? (
        <div className="deal-grid">
          {items.map((item) => (
            <SavedCampaignCard
              key={item.savedId}
              campaignId={item.campaignId}
              slug={item.slug}
              brandName={item.brandName}
              categoryName={item.categoryName}
              platform={item.platform}
              commissionLabel={item.commissionLabel}
            />
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <b>Belum ada campaign tersimpan.</b>
          <p>Simpan campaign yang kamu suka dari halaman deal untuk melihatnya di sini.</p>
          <Link href="/deals">Jelajahi semua deal ↗</Link>
        </div>
      )}
    </section>
  );
}
