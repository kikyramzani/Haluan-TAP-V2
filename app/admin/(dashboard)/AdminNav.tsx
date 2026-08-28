"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const MAIN_ITEMS: Array<[string, string, string]> = [
  ["/admin", "▦", "Ringkasan"],
  ["/admin/brand", "◎", "Brand"],
  ["/admin/campaign", "⌁", "Campaign"],
  ["/admin/produk", "▧", "Produk"],
  ["/admin/link", "∞", "Link"],
  ["/admin/kategori", "◐", "Kategori"],
  ["/admin/creator", "☺", "Creator"],
  ["/admin/sample", "+", "Sample"],
  ["/admin/analitik", "△", "Analitik"],
];

const SUPER_ADMIN_ITEMS: Array<[string, string, string]> = [
  ["/admin/pengguna", "◆", "Pengguna & Peran"],
  ["/admin/audit", "▤", "Audit Log"],
  ["/admin/import", "⇩", "Import Data"],
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="admin-sidebar">
      <Link className="brand" href="/">
        <Image src="/haluan-logo.png" alt="Haluan Digital Network" width={107} height={35} />
        <span className="brand-divider" />
        <strong>TAP</strong>
      </Link>
      <span className="sidebar-label">ADMIN WORKSPACE</span>
      {MAIN_ITEMS.map(([href, icon, label]) => (
        <Link key={href} href={href} className={`nav-link${isActive(pathname, href) ? " active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
          <i>{icon}</i>
          {label}
        </Link>
      ))}
      {isSuperAdmin ? (
        <>
          <span className="sidebar-label">SUPER ADMIN</span>
          {SUPER_ADMIN_ITEMS.map(([href, icon, label]) => (
            <Link key={href} href={href} className={`nav-link${isActive(pathname, href) ? " active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <i>{icon}</i>
              {label}
            </Link>
          ))}
        </>
      ) : null}
      <div className="admin-secure">
        <i>◆</i>
        <b>Protected workspace</b>
        <p>Data creator hanya tersedia untuk administrator terverifikasi.</p>
      </div>
    </aside>
  );
}
