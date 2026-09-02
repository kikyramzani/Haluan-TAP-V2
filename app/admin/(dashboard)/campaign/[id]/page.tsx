import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../../lib/db";
import CampaignForm from "./CampaignForm";
import TierLinkEditor from "./TierLinkEditor";
import Icon from "../../../../components/Icon";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      brand: true,
      tiers: { orderBy: { sortIndex: "asc" } },
      links: { orderBy: { sortIndex: "asc" } },
    },
  });
  if (!campaign) notFound();

  const rowCount = Math.max(campaign.tiers.length, campaign.links.length);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const tier = campaign.tiers[index];
    const link = campaign.links[index];
    return {
      tierId: tier?.id,
      linkId: link?.id,
      label: tier?.label ?? "",
      commission: tier?.commission === null || tier?.commission === undefined ? "" : String(Number(tier.commission)),
      url: link?.url ?? "",
    };
  });

  const validUntil = campaign.validUntil ? campaign.validUntil.toISOString().slice(0, 10) : "";

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>CAMPAIGN</span>
          <h1>{campaign.brand.displayName}</h1>
        </div>
        <Link className="btn btn-ghost" href="/admin/campaign">
          <Icon name="arrow-left" /> Kembali
        </Link>
      </div>

      <p className="admin-hint">
        {campaign.platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop"} · Tipe komisi:{" "}
        {campaign.commissionType === "PERSENTASE" ? "Persentase" : "Ketentuan platform"} · Slug: <code>{campaign.slug}</code>
      </p>

      <CampaignForm
        campaign={{
          id: campaign.id,
          status: campaign.status,
          sampleQuota: campaign.sampleQuota,
          sampleQuotaRemaining: campaign.sampleQuotaRemaining,
          brief: campaign.brief,
          creatorRequirements: campaign.creatorRequirements,
          displayOrderWeight: campaign.displayOrderWeight,
          newSku: campaign.newSku,
          specialLivePrice: campaign.specialLivePrice,
          validUntil,
        }}
      />

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>TIER &amp; LINK</span>
            <h2>{rows.length} baris</h2>
          </div>
        </div>
        <TierLinkEditor campaignId={campaign.id} commissionType={campaign.commissionType} initialRows={rows} />
      </section>
    </>
  );
}
