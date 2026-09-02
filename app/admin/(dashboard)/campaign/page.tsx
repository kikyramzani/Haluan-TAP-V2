import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/db";
import { commissionRangeLabel, minMaxCommission } from "../../../../lib/commission-display";
import Icon from "../../../components/Icon";
import AdminPagination from "../AdminPagination";

type Props = { searchParams: Promise<{ q?: string; platform?: string; status?: string; page?: string }> };

const PAGE_SIZE = 50;

function platformLabel(platform: string) {
  return platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop";
}

function statusLabel(status: string) {
  return status === "ENDED" ? "Berakhir" : status === "HIDDEN" ? "Disembunyikan" : "Aktif";
}

/**
 * Tiga status, tiga kelas.
 *
 * Sebelumnya ENDED dan HIDDEN sama-sama memetakan ke status-archived, dan
 * status-archived sendiri tidak pernah didefinisikan di CSS mana pun, jadi
 * ketiga nilainya tampil sebagai pil abu-abu yang tidak bisa dibedakan.
 * "Berakhir" (masa berlakunya habis) dan "Disembunyikan" (keputusan admin)
 * adalah dua hal berbeda dan perlu terlihat berbeda.
 */
function statusClass(status: string) {
  return status === "ENDED" ? "status-ended" : status === "HIDDEN" ? "status-hidden" : "status-active";
}

export default async function AdminCampaignPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const platform = params.platform === "tiktok" ? "TIKTOK_SHOP" : params.platform === "shopee" ? "SHOPEE_AFFILIATE" : "all";
  const status = params.status === "active" ? "ACTIVE" : params.status === "ended" ? "ENDED" : params.status === "hidden" ? "HIDDEN" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.CampaignWhereInput = {
    ...(q ? { brand: { displayName: { contains: q, mode: "insensitive" as const } } } : {}),
    ...(platform !== "all" ? { platform } : {}),
    ...(status !== "all" ? { status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: { brand: true, tiers: { select: { commission: true } } },
      orderBy: [{ brand: { displayName: "asc" } }, { platform: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.campaign.count({ where }),
  ]);

  const statKeys = Array.from(new Set(rows.map((row) => `${row.brandId}:${row.platform}`)));
  const stats = statKeys.length
    ? await prisma.brandPlatformStat.findMany({
        where: { OR: rows.map((row) => ({ brandId: row.brandId, platform: row.platform })) },
      })
    : [];
  const statMap = new Map(stats.map((stat) => [`${stat.brandId}:${stat.platform}`, stat]));

  function commissionRange(row: (typeof rows)[number]) {
    const stat = statMap.get(`${row.brandId}:${row.platform}`);
    const { min, max } = stat && stat.minCommission !== null
      ? { min: Number(stat.minCommission), max: stat.maxCommission !== null ? Number(stat.maxCommission) : Number(stat.minCommission) }
      : minMaxCommission(row.tiers);
    return commissionRangeLabel({ commissionType: row.commissionType, min, max });
  }

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>CAMPAIGN</span>
          <h1>Kelola campaign</h1>
        </div>
        <Link className="btn btn-primary" href="/admin/campaign/new">
          Tambah campaign
        </Link>
      </div>

      <form className="admin-filterbar" role="search">
        <label>
          <Icon name="magnifying-glass" />
          <input aria-label="Cari nama brand" type="search" name="q" defaultValue={q} placeholder="Cari nama brand…" />
        </label>
        <select name="platform" defaultValue={params.platform === "tiktok" || params.platform === "shopee" ? params.platform : "all"}>
          <option value="all">Semua platform</option>
          <option value="tiktok">TikTok Shop</option>
          <option value="shopee">Shopee</option>
        </select>
        <select name="status" defaultValue={params.status === "active" || params.status === "ended" || params.status === "hidden" ? params.status : "all"}>
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="ended">Berakhir</option>
          <option value="hidden">Disembunyikan</option>
        </select>
        <button type="submit">Terapkan</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Platform</th>
              <th>Komisi</th>
              <th>Tier</th>
              <th>Status</th>
              <th><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="row-brand">
                  <b>{row.brand.displayName}</b>
                </td>
                <td>{platformLabel(row.platform)}</td>
                <td>{commissionRange(row)}</td>
                <td className="numeric">{row.tiers.length}</td>
                <td>
                  <span className={`admin-status ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                </td>
                <td className="table-actions">
                  <Link href={`/admin/campaign/${row.id}`}>Kelola</Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Belum ada campaign yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        unit="campaign"
        basePath="/admin/campaign"
        query={{ q, platform: params.platform, status: params.status }}
      />
    </>
  );
}
