"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../components/Icon";

const ITEMS: Array<[string, IconName, string]> = [
  ["/dashboard", "house", "Overview"],
  ["/deals", "storefront", "Link komisi"],
  ["/dashboard/sample", "package", "Sample"],
  ["/dashboard/tersimpan", "bookmark-simple", "Tersimpan"],
  ["/dashboard/performa", "chart-line-up", "Performa"],
  ["/dashboard/notifikasi", "bell", "Notifikasi"],
  ["/dashboard/profil", "user-circle", "Profil creator"],
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
          <Icon name={icon} />
          {label}
        </Link>
      ))}
      {isAdmin ? (
        <Link href="/admin">
          <Icon name="shield-check" />
          Admin
        </Link>
      ) : null}
      <div className="sidebar-help">
        <b>Butuh bantuan?</b>
        <p>Tim Haluan siap membantu proses aktivasi akunmu.</p>
        <a href="mailto:hello@haluandigital.agency">
          Hubungi tim <Icon name="arrow-up-right" />
        </a>
      </div>
    </aside>
  );
}
