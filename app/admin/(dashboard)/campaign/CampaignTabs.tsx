"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Empat permukaan CMS katalog dalam satu strip tab.
 *
 * Sebelumnya Produk, Link, dan Kategori berdiri sendiri di sidebar, padahal
 * ketiganya hanya bisa diubah dari halaman campaign. Admin harus meloncat ke
 * sidebar, membuka daftar, lalu diarahkan balik ke campaign yang sama. Tab ini
 * menempatkan keempatnya berdampingan sehingga perpindahannya satu klik.
 *
 * Kelas .admin-tabs/.admin-tab sudah ada di admin.css sejak awal, lengkap
 * dengan dukungan aria-selected, tetapi belum pernah dipakai sekali pun.
 */
const TABS: Array<[string, string, string]> = [
  ["/admin/campaign", "Campaign", "Daftar dan editor campaign"],
  ["/admin/campaign/produk", "Produk", "Tier komisi tiap campaign"],
  ["/admin/campaign/link", "Link", "URL afiliasi tiap campaign"],
  ["/admin/campaign/kategori", "Kategori", "Kategori yang dipakai brand"],
];

/**
 * Tab "Campaign" mencakup /new dan /[id]; tiga sisanya cocok persis.
 *
 * Tanpa pengecualian ini /admin/campaign/produk akan menyalakan dua tab
 * sekaligus, karena prefixnya memang /admin/campaign.
 */
function isActive(pathname: string, href: string) {
  if (href !== "/admin/campaign") return pathname === href;
  return !TABS.some(([other]) => other !== href && pathname === other);
}

export default function CampaignTabs() {
  const pathname = usePathname();
  return (
    <div className="admin-tabs" role="tablist" aria-label="Bagian katalog">
      {TABS.map(([href, label, hint]) => (
        <Link
          key={href}
          href={href}
          role="tab"
          className="admin-tab"
          title={hint}
          aria-selected={isActive(pathname, href)}
          aria-current={isActive(pathname, href) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
