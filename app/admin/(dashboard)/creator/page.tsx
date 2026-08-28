import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/db";
import CreatorTable from "./CreatorTable";

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

const PAGE_SIZE = 50;
const STATUS_MAP = {
  pending: "PENDING",
  verified: "VERIFIED",
  rejected: "REJECTED",
  suspended: "SUSPENDED",
} as const;
type StatusFilter = keyof typeof STATUS_MAP | "all";

function parseStatus(value: string | undefined): StatusFilter {
  return value !== undefined && value in STATUS_MAP ? (value as StatusFilter) : "all";
}

export default async function AdminCreatorPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const status = parseStatus(params.status);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.CreatorWhereInput = {
    ...(status !== "all" ? { membership: STATUS_MAP[status] } : {}),
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" as const } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { user: { phone: { contains: q, mode: "insensitive" as const } } },
            { tiktokUsername: { contains: q, mode: "insensitive" as const } },
            { shopeeUsername: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.creator.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.creator.count({ where }),
  ]);

  const creators = rows.map((creator) => ({
    id: creator.id,
    name: creator.user.name,
    email: creator.user.email,
    membership: creator.membership,
    handle: creator.tiktokUsername ? `@${creator.tiktokUsername}` : creator.shopeeUsername ? `@${creator.shopeeUsername}` : "—",
    followers: creator.followers,
    joinedAt: creator.createdAt.toISOString(),
  }));

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>KREATOR</span>
          <h1>Database kreator</h1>
        </div>
      </div>

      <form className="admin-filterbar" role="search">
        <label>
          ⌕
          <input type="search" name="q" defaultValue={q} placeholder="Cari nama, email, telepon, username…" />
        </label>
        <select name="status" defaultValue={status}>
          <option value="all">Semua status</option>
          <option value="pending">Pending</option>
          <option value="verified">Terverifikasi</option>
          <option value="rejected">Ditolak</option>
          <option value="suspended">Ditangguhkan</option>
        </select>
        <button type="submit">Terapkan</button>
      </form>

      <CreatorTable creators={creators} />

      <div className="admin-pagination">
        <Link aria-disabled={page <= 1} href={`/admin/creator?q=${encodeURIComponent(q)}&status=${status}&page=${page - 1}`}>
          ← Sebelumnya
        </Link>
        <span>
          Halaman {page} dari {Math.max(1, Math.ceil(total / PAGE_SIZE))} · {total} kreator
        </span>
        <Link aria-disabled={page >= Math.ceil(total / PAGE_SIZE)} href={`/admin/creator?q=${encodeURIComponent(q)}&status=${status}&page=${page + 1}`}>
          Berikutnya →
        </Link>
      </div>
    </>
  );
}
