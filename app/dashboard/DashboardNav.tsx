"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: Array<[string, string, string]> = [
  ["/dashboard", "⌂", "Overview"],
  ["/deals", "⌁", "Link komisi"],
  ["/dashboard/sample", "+", "Sample"],
  ["/dashboard/tersimpan", "☆", "Tersimpan"],
  ["/dashboard/performa", "△", "Performa"],
  ["/dashboard/notifikasi", "◔", "Notifikasi"],
  ["/dashboard/profil", "○", "Profil creator"],
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="creator-sidebar">
      <span className="sidebar-label">WORKSPACE</span>
      {ITEMS.map(([href, icon, label]) => (
        <Link key={href} href={href} className={isActive(pathname, href) ? "active" : ""} aria-current={isActive(pathname, href) ? "page" : undefined}>
          <i>{icon}</i>
          {label}
        </Link>
      ))}
      {isAdmin ? (
        <Link href="/admin">
          <i>◆</i>
          Admin
        </Link>
      ) : null}
      <div className="sidebar-help">
        <b>Butuh bantuan?</b>
        <p>Tim Haluan siap membantu proses aktivasi akunmu.</p>
        <a href="mailto:hello@haluandigital.agency">Hubungi tim ↗</a>
      </div>
    </aside>
  );
}
