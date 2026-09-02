import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import RoleControls from "./RoleControls";

export default async function AdminPenggunaPage() {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin?error=forbidden");

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>SUPER ADMIN</span>
          <h1>Pengguna &amp; peran</h1>
        </div>
      </div>

      <p className="admin-hint">
        Peran ADMIN dikelola otomatis dari daftar <code>ADMIN_EMAILS</code> setiap request — mengubahnya di sini tidak
        akan bertahan selama email masih ada di allowlist. Kontrol di bawah hanya untuk mempromosikan atau
        menurunkan status <b>Super Admin</b>, yang murni manual.
      </p>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Peran</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === admin.id;
              return (
                <tr key={user.id}>
                  <td>
                    <b>{user.name}</b>
                    {isSelf ? " (kamu)" : ""}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    {/* Tanpa kelas peran, kedua nilai dirender sebagai pil abu-abu
                        yang identik — di halaman yang justru tugasnya membedakan
                        keduanya. */}
                    <span className={`admin-status${user.role === "SUPER_ADMIN" ? " role-super" : ""}`}>
                      {user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
                    </span>
                  </td>
                  <td>
                    {isSelf ? (
                      <span className="empty-cell">—</span>
                    ) : (
                      <RoleControls userId={user.id} role={user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN"} />
                    )}
                  </td>
                </tr>
              );
            })}
            {!users.length ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  Belum ada akun Admin atau Super Admin.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
