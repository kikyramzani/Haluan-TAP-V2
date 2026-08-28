import Link from "next/link";
import { prisma } from "../../../../lib/db";
import BrandTable from "./BrandTable";

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

const PAGE_SIZE = 50;

export default async function AdminBrandPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = params.status === "archived" ? "archived" : params.status === "active" ? "active" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where = {
    ...(q ? { displayName: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "archived" ? { hidden: true } : status === "active" ? { hidden: false } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.brand.findMany({
      where,
      include: { category: true, _count: { select: { campaigns: true } } },
      orderBy: { displayName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.brand.count({ where }),
  ]);

  const brands = rows.map((brand) => ({
    id: brand.id,
    displayName: brand.displayName,
    categoryName: brand.category?.name ?? "Lainnya",
    campaignCount: brand._count.campaigns,
    hidden: brand.hidden,
    featured: brand.featured,
  }));

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>BRAND</span>
          <h1>Kelola brand</h1>
        </div>
        <Link className="btn btn-primary" href="/admin/brand/new">
          Tambah brand
        </Link>
      </div>

      <form className="admin-filterbar" role="search">
        <label>
          ⌕
          <input type="search" name="q" defaultValue={q} placeholder="Cari brand…" />
        </label>
        <select name="status" defaultValue={status}>
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="archived">Arsip</option>
        </select>
        <button type="submit">Terapkan</button>
      </form>

      <BrandTable brands={brands} />

      <div className="admin-pagination">
        <Link aria-disabled={page <= 1} href={`/admin/brand?q=${encodeURIComponent(q)}&status=${status}&page=${page - 1}`}>
          ← Sebelumnya
        </Link>
        <span>
          Halaman {page} dari {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total} brand
        </span>
        <Link aria-disabled={page >= Math.ceil(total / PAGE_SIZE)} href={`/admin/brand?q=${encodeURIComponent(q)}&status=${status}&page=${page + 1}`}>
          Berikutnya →
        </Link>
      </div>
    </>
  );
}
