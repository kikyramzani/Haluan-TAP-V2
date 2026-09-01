import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { logoutAction } from "../logout-action";
import DashboardNav from "./DashboardNav";

/**
 * Shared shell for every /dashboard/* route (Phase 5 of the rebuild plan,
 * see /Users/macbook/.claude/plans/kamu-lihat-dari-bagian-purrfect-hopcroft.md).
 * Gates on both being signed in AND having finished /daftar/lengkapi,
 * per the doc, onboarding is blocked "bukan cuma di halaman login, tapi juga
 * di layout dashboard itu sendiri."
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/dashboard");
  const creator = await prisma.creator.findUnique({ where: { userId: user.id }, select: { onboardingCompletedAt: true } });
  if (!creator?.onboardingCompletedAt) redirect("/daftar/lengkapi");

  const membershipLabel = user.membership === "verified" ? "MCN terverifikasi" : user.membership === "rejected" ? "Verifikasi perlu diperbaiki" : user.membership === "suspended" ? "Akun ditangguhkan" : "Menunggu verifikasi MCN";

  return (
    <main className="creator-app">
      <nav className="creator-topbar shell">
        <Link className="brand" href="/">
          <Image src="/haluan-logo.png" alt="Haluan Digital Network" width={107} height={35} />
          <span className="brand-divider" />
          <strong>TAP</strong>
        </Link>
        <div className="creator-user">
          <span>
            <b>{user.name}</b>
            <small>{membershipLabel}</small>
          </span>
          <i>{user.name.slice(0, 1).toUpperCase()}</i>
          <form action={logoutAction}>
            <button type="submit">Keluar</button>
          </form>
        </div>
      </nav>
      <section className="dashboard-shell shell">
        <DashboardNav isAdmin={user.role === "admin" || user.role === "super_admin"} />
        <div className="creator-content">{children}</div>
      </section>
    </main>
  );
}
