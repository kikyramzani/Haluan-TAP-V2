import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/db";
import { campaignCommissionLabel } from "../../../../lib/commission-display";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

const PAGE_SIZE = 50;

function platformLabel(platform: string) {
  return platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop";
}

export default async function AdminProdukPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.CampaignTierWhereInput = q
    ? {
        OR: [
          { label: { contains: q, mode: "insensitive" as const } },
          { campaign: { brand: { displayName: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.campaignTier.findMany({
      where,
      include: { campaign: { include: { brand: true } } },
      orderBy: [{ campaign: { brand: { displayName: "asc" } } }, { sortIndex: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.campaignTier.count({ where }),
  ]);

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>PRODUK</span>
          <h1>Daftar tier campaign</h1>
        </div>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        Daftar baris tier untuk audit cepat. Edit dilakukan di halaman campaign masing-masing agar tidak ada dua jalur tulis untuk data yang sama.
      </p>

      <form className="admin-filterbar single" role="search">
        <label>
          ⌕
          <input type="search" name="q" defaultValue={q} placeholder="Cari brand atau label tier…" />
        </label>
        <button type="submit">Cari</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Platform</th>
              <th>Tier</th>
              <th>Komisi</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((tier) => (
              <tr key={tier.id}>
                <td className="row-brand">
                  <b>{tier.campaign.brand.displayName}</b>
                </td>
                <td>{platformLabel(tier.campaign.platform)}</td>
                <td>{tier.label || "—"}</td>
                <td>{campaignCommissionLabel({ commissionType: tier.campaign.commissionType, commission: tier.commission === null ? null : Number(tier.commission) })}</td>
                <td className="table-actions">
                  <Link href={`/admin/campaign/${tier.campaignId}`}>Kelola →</Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Tidak ada tier yang cocok dengan pencarian ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <Link aria-disabled={page <= 1} href={`/admin/produk?q=${encodeURIComponent(q)}&page=${page - 1}`}>
          ← Sebelumnya
        </Link>
        <span>
          Halaman {page} dari {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total} tier
        </span>
        <Link aria-disabled={page >= Math.ceil(total / PAGE_SIZE)} href={`/admin/produk?q=${encodeURIComponent(q)}&page=${page + 1}`}>
          Berikutnya →
        </Link>
      </div>
    </>
  );
}
