import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../../../../lib/db";
import BrandForm from "../BrandForm";
import MergeForm from "./MergeForm";
import Icon from "../../../../components/Icon";

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [brand, categories] = await Promise.all([
    prisma.brand.findUnique({
      where: { id },
      include: { campaigns: { include: { tiers: true } }, platformStats: true },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!brand) notFound();

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>BRAND</span>
          <h1>{brand.displayName}</h1>
        </div>
        <Link className="btn btn-ghost" href="/admin/brand">
          <Icon name="arrow-left" /> Kembali
        </Link>
      </div>

      <BrandForm brand={brand} categories={categories} />

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>CAMPAIGN</span>
            <h2>{brand.campaigns.length} campaign terhubung</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Status</th>
                <th>Tier</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {brand.campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop"}</td>
                  <td>{campaign.status}</td>
                  <td className="numeric">{campaign.tiers.length}</td>
                  <td>
                    <Link href={`/admin/campaign/${campaign.id}`}>Kelola <Icon name="arrow-right" /></Link>
                  </td>
                </tr>
              ))}
              {!brand.campaigns.length ? (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    Belum ada campaign untuk brand ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <MergeForm brandId={brand.id} />
    </>
  );
}
