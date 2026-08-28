import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "../../../../lib/auth";
import { listAuditEvents } from "../../../../lib/audit";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

const PAGE_SIZE = 50;

export default async function AdminAuditPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin?error=forbidden");

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { items, total } = await listAuditEvents({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>SUPER ADMIN</span>
          <h1>Audit log</h1>
        </div>
      </div>

      <form className="admin-filterbar single" role="search">
        <label>
          ⌕
          <input type="search" name="q" defaultValue={q} placeholder="Cari berdasarkan aksi atau entitas…" />
        </label>
        <button type="submit">Terapkan</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Aktor</th>
              <th>Aksi</th>
              <th>Entitas</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {items.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString("id-ID")}</td>
                <td>{event.actorEmail ?? (event.actorId || "Sistem")}</td>
                <td>
                  <b>{event.action}</b>
                </td>
                <td>{event.targetId || "—"}</td>
                <td>
                  {event.before !== undefined || event.after !== undefined ? (
                    <details>
                      <summary>Lihat JSON</summary>
                      <pre>{JSON.stringify({ before: event.before ?? null, after: event.after ?? null }, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  Tidak ada log yang cocok dengan pencarian ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <Link aria-disabled={page <= 1} href={`/admin/audit?q=${encodeURIComponent(q)}&page=${page - 1}`}>
          ← Sebelumnya
        </Link>
        <span>
          Halaman {page} dari {totalPages} · {total} log
        </span>
        <Link aria-disabled={page >= totalPages} href={`/admin/audit?q=${encodeURIComponent(q)}&page=${page + 1}`}>
          Berikutnya →
        </Link>
      </div>
    </>
  );
}
