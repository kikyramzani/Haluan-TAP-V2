"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../../components/Icon";

/**
 * Ikon Phosphor lewat Icon.tsx, bukan glyph Unicode.
 *
 * Glyph lama (▦ ◎ ⌁ ▧ ∞ ◐ ☺ △ ◆ ▤ ⇩) adalah penyimpangan brand yang terlihat,
 * BRAND-SYSTEM.md §6.4 menyebutnya langsung, dan juga masalah aksesibilitas:
 * karakter itu punya nama Unicode sendiri, jadi pembaca layar melafalkannya
 * ("kotak arsir", "lingkaran separuh") di samping label yang sudah benar.
 */
const MAIN_ITEMS: Array<[string, IconName, string]> = [
  ["/admin", "squares-four", "Ringkasan"],
  ["/admin/brand", "storefront", "Brand"],
  // Produk, Link, dan Kategori tidak lagi berdiri sendiri di sini. Ketiganya
  // hanya bisa diubah dari halaman campaign, jadi tempatnya sebagai tab di
  // dalam /admin/campaign (lihat CampaignTabs.tsx), bukan sebagai tujuan
  // sidebar yang selalu memantulkan admin kembali ke campaign yang sama.
  ["/admin/campaign", "megaphone", "Campaign"],
  ["/admin/creator", "user-circle", "Creator"],
  ["/admin/sample", "gift", "Sample"],
  ["/admin/analitik", "chart-line-up", "Analitik"],
];

const SUPER_ADMIN_ITEMS: Array<[string, IconName, string]> = [
  ["/admin/pengguna", "users", "Pengguna & Peran"],
  ["/admin/audit", "clipboard-text", "Audit Log"],
  ["/admin/import", "arrow-down", "Import Data"],
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="admin-sidebar">
      <Link className="brand" href="/" aria-label="Haluan TAP, ke beranda">
        <Image src="/haluan-logo.png" alt="" width={107} height={35} /><strong>TAP</strong>
      </Link>
      <span className="sidebar-label">ADMIN WORKSPACE</span>
      {MAIN_ITEMS.map(([href, icon, label]) => (
        <Link key={href} href={href} className={`nav-link${isActive(pathname, href) ? " active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
          <i>
            <Icon name={icon} />
          </i>
          {label}
        </Link>
      ))}
      {isSuperAdmin ? (
        <>
          <span className="sidebar-label">SUPER ADMIN</span>
          {SUPER_ADMIN_ITEMS.map(([href, icon, label]) => (
            <Link key={href} href={href} className={`nav-link${isActive(pathname, href) ? " active" : ""}`} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <i>
                <Icon name={icon} />
              </i>
              {label}
            </Link>
          ))}
        </>
      ) : null}
      <div className="admin-secure">
        <i>
          <Icon name="shield-check" />
        </i>
        <b>Protected workspace</b>
        <p>Data creator hanya tersedia untuk administrator terverifikasi.</p>
      </div>
    </aside>
  );
}
