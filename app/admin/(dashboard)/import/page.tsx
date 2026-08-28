import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import ImportForm from "./ImportForm";

type ImportSummary = { newCount?: number; updatedCount?: number; failedCount?: number; written?: number };

export default async function AdminImportPage() {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin?error=forbidden");

  const runs = await prisma.importRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { actor: { select: { email: true } } },
  });

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>SUPER ADMIN</span>
          <h1>Import data brand</h1>
        </div>
      </div>

      <ImportForm />

      <div className="panel-heading" style={{ marginTop: "var(--space-8)" }}>
        <div>
          <span>RIWAYAT</span>
          <h2>10 impor terakhir</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Oleh</th>
              <th>Baru</th>
              <th>Diperbarui</th>
              <th>Gagal</th>
              <th>Total ditulis</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const summary = (run.summary ?? {}) as ImportSummary;
              return (
                <tr key={run.id}>
                  <td>{new Date(run.createdAt).toLocaleString("id-ID")}</td>
                  <td>{run.actor?.email ?? "—"}</td>
                  <td className="numeric">{summary.newCount ?? 0}</td>
                  <td className="numeric">{summary.updatedCount ?? 0}</td>
                  <td className="numeric">{summary.failedCount ?? 0}</td>
                  <td className="numeric">{summary.written ?? 0}</td>
                </tr>
              );
            })}
            {!runs.length ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Belum ada riwayat import.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
