"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./components/Icon";

type Tab = { href: string; icon: IconName; label: string };

/**
 * Tab pertama saat sudah masuk adalah /dashboard, bukan /: begitu creator
 * punya akun, beranda yang relevan adalah berandanya sendiri, bukan halaman
 * pemasaran.
 */
const SIGNED_IN: Tab[] = [
  { href: "/dashboard", icon: "house", label: "Beranda" },
  { href: "/deals", icon: "storefront", label: "Deal" },
  { href: "/request-sample", icon: "package", label: "Sample" },
  { href: "/dashboard/performa", icon: "chart-line-up", label: "Performa" },
  { href: "/dashboard/profil", icon: "user-circle", label: "Akun" },
];

/**
 * Semua tab di sini bisa dibuka tanpa akun — tidak ada tab yang berujung ke
 * dinding login. /request-sample tetap masuk karena halamannya punya keadaan
 * "masuk dulu" sendiri, bukan redirect. Tidak ada tab "Daftar" terpisah:
 * rutenya sama dengan Masuk, jadi dua tab akan sama-sama aktif di halaman itu.
 */
const SIGNED_OUT: Tab[] = [
  { href: "/", icon: "house", label: "Beranda" },
  { href: "/deals", icon: "storefront", label: "Deal" },
  { href: "/request-sample", icon: "package", label: "Sample" },
  { href: "/daftar?mode=login", icon: "sign-in", label: "Masuk" },
];

/**
 * "/" dan "/dashboard" harus cocok persis: dengan pencocokan awalan biasa,
 * /dashboard/performa akan menyalakan tiga tab sekaligus.
 */
function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (path === "/" || path === "/dashboard") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function MobileNav({ isSignedIn }: { isSignedIn: boolean }) {
  const pathname = usePathname();

  // Admin punya navigasinya sendiri (AdminNav.tsx) — tanpa penjagaan ini, bar
  // creator menutupi tiap halaman /admin di lebar mobile.
  if (pathname.startsWith("/admin")) return null;
  // /daftar/lengkapi adalah gerbang wajib: app/dashboard/layout.tsx memantulkan
  // creator kembali ke sini sampai onboarding-nya selesai. Menampilkan tab di
  // situ menawarkan jalan keluar yang sebenarnya tidak ada.
  if (pathname.startsWith("/daftar/lengkapi")) return null;

  const tabs = isSignedIn ? SIGNED_IN : SIGNED_OUT;

  return (
    <nav className="mobile-nav" aria-label="Navigasi utama">
      <ul>
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link href={tab.href} aria-current={active ? "page" : undefined}>
                <span className="mobile-nav-icon">
                  <Icon name={tab.icon} variant={active ? "solid" : "outline"} />
                </span>
                <span className="mobile-nav-label">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
