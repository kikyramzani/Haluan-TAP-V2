import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "../../../lib/auth";
import { logoutAction } from "../../logout-action";
import AdminNav from "./AdminNav";
import Icon from "../../components/Icon";

/**
 * Shared shell for every /admin/* route (Phase 4 of the rebuild plan. See
 * /Users/macbook/.claude/plans/kamu-lihat-dari-bagian-purrfect-hopcroft.md).
 * `requireAdmin()` gates the whole subtree once here instead of per-page.
 * Each page renders its own heading inside .admin-main; this shell only
 * owns the sidebar and the profile/logout bar.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <main className="admin-app">
      <AdminNav isSuperAdmin={admin.role === "super_admin"} />
      <section className="admin-main">
        <header className="admin-header">
          <div>
            <span>HALUAN AFFILIATE OPERATIONS</span>
          </div>
          <div className="admin-profile">
            <Link href="/dashboard"><Icon name="arrow-left" /> Dashboard creator</Link>
            <span>
              <b>{admin.name}</b>
              <small>{admin.role === "super_admin" ? "Super Admin" : "Administrator"} terverifikasi</small>
            </span>
            <i>{admin.name.slice(0, 1).toUpperCase()}</i>
            <form action={logoutAction}>
              <button type="submit">Keluar</button>
            </form>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
