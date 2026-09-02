import Link from "next/link";
import { listSampleRequests } from "../../../../lib/requests";
import { STATUS_LABELS, STATUS_ORDER, formatDate, type SampleRequestStatus } from "./labels";
import Icon from "../../../components/Icon";
import AdminPagination from "../AdminPagination";

type Props = { searchParams: Promise<{ q?: string; status?: string; page?: string }> };

const PAGE_SIZE = 20;

function isStatus(value: string): value is SampleRequestStatus {
  return (STATUS_ORDER as string[]).includes(value);
}

export default async function AdminSamplePage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  // Queue auto-filters to "Menunggu" (PENDING) when no ?status= is present -
  // that's the work admins actually need to act on. "all" (rendered as
  // "Semua status") is the explicit opt-out.
  const statusParam = params.status ?? "PENDING";
  const status: SampleRequestStatus | "all" = statusParam === "all" ? "all" : isStatus(statusParam) ? statusParam : "PENDING";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { items, total } = await listSampleRequests({
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status === "all" ? undefined : status,
  });


  return (
    <>
      <div className="panel-heading">
        <div>
          <span>SAMPLE</span>
          <h1>Antrean request sample</h1>
        </div>
      </div>

      <form className="admin-filterbar" role="search">
        <label>
          <Icon name="magnifying-glass" />
          <input aria-label="Cari brand, username, atau nomor resi" type="search" name="q" defaultValue={q} placeholder="Cari brand, username, atau nomor resi…" />
        </label>
        <select name="status" defaultValue={status}>
          <option value="all">Semua status</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <button type="submit">Terapkan</button>
      </form>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Creator</th>
              <th>Username</th>
              <th>Status</th>
              <th>Diajukan</th>
              <th><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((request) => (
              <tr key={request.id}>
                <td>
                  <b>{request.campaign?.brand.displayName ?? request.brandNameSnapshot}</b>
                </td>
                <td>{request.creator.user.name}</td>
                <td>{request.username ? `@${request.username}` : "—"}</td>
                <td>
                  <span className={`admin-status status-${request.status.toLowerCase()}`}>{STATUS_LABELS[request.status]}</span>
                </td>
                <td>{formatDate(request.requestedAt)}</td>
                <td className="table-actions">
                  <Link href={`/admin/sample/${request.id}`}>Detail</Link>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Tidak ada request sample yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination page={page} pageSize={PAGE_SIZE} total={total} unit="request" basePath="/admin/sample" query={{ q, status }} />
    </>
  );
}
