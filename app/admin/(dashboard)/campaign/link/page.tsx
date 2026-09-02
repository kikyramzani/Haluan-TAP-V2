import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../../lib/db";
import Icon from "../../../../components/Icon";
import AdminPagination from "../../AdminPagination";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

const PAGE_SIZE = 50;

function platformLabel(platform: string) {
  return platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop";
}

function truncateUrl(url: string, max = 60) {
  return url.length > max ? `${url.slice(0, max)}…` : url;
}

export default async function AdminLinkPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.CampaignLinkWhereInput = q
    ? {
        OR: [
          { url: { contains: q, mode: "insensitive" as const } },
          { campaign: { brand: { displayName: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.campaignLink.findMany({
      where,
      include: { campaign: { include: { brand: true } } },
      orderBy: [{ campaign: { brand: { displayName: "asc" } } }, { sortIndex: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.campaignLink.count({ where }),
  ]);

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>LINK</span>
          <h1>Daftar link campaign</h1>
        </div>
      </div>

      <p className="admin-hint">
        Daftar link untuk audit cepat. Edit dilakukan di halaman campaign masing-masing agar tidak ada dua jalur tulis untuk data yang sama.
      </p>

      <form className="admin-filterbar single" role="search">
        <label>
          <Icon name="magnifying-glass" />
          <input aria-label="Cari brand atau URL" type="search" name="q" defaultValue={q} placeholder="Cari brand atau URL…" />
        </label>
        <button type="submit">Cari</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Platform</th>
              <th>URL</th>
              <th>Utama</th>
              <th><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((link) => (
              <tr key={link.id}>
                <td className="row-brand">
                  <b>{link.campaign.brand.displayName}</b>
                </td>
                <td>{platformLabel(link.campaign.platform)}</td>
                <td>
                  <a className="table-url" href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
                    {truncateUrl(link.url)}
                  </a>
                </td>
                <td>{link.isPrimary ? <span className="admin-status status-active">Utama</span> : null}</td>
                <td className="table-actions">
                  <Link href={`/admin/campaign/${link.campaignId}`}>Kelola <Icon name="arrow-right" /></Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Tidak ada link yang cocok dengan pencarian ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={total} unit="link" basePath="/admin/campaign/link" query={{ q }} />
    </>
  );
}
