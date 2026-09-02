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

      <div className="admin-note">
        <b>Cara mengisi template CSV</b>
        <ul>
          <li><b>nama</b> — wajib diisi, persis seperti nama brand yang ingin ditampilkan.</li>
          <li><b>kategori</b> — opsional. Harus sama persis dengan salah satu kategori di halaman Kategori. Kalau tidak cocok, brand tetap masuk tapi tanpa kategori — bisa dirapikan lagi belakangan.</li>
          <li><b>logo</b> — opsional, boleh dikosongkan dulu. Logo bisa diunggah manual dari halaman detail brand kapan saja.</li>
          <li><b>sembunyikan</b> — isi <code>TRUE</code> kalau brand ini belum boleh tampil ke publik, atau kosongkan/<code>FALSE</code> kalau boleh tampil.</li>
          <li><b>unggulan</b> — isi <code>TRUE</code> kalau brand ini ingin ditonjolkan sebagai unggulan.</li>
        </ul>
        <p>Nama brand yang sama muncul dua kali di file yang sama akan ditolak — cukup satu baris per brand.</p>
      </div>

      <ImportForm />

      <div className="panel-heading import-section">
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
