"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Icon from "./Icon";

type Props = {
  /** Beranda menautkan ke anchor di halaman yang sama; halaman lain kembali ke home. */
  variant?: "home" | "subpage";
  /**
   * Sesi pemilik, dibaca oleh Server Component pemanggil lewat `getCurrentUser()`
   * dan diteruskan sebagai prop — bukan diambil lewat fetch klien di sini.
   *
   * Header ini dipasang per halaman (beranda, /deals, /deal/[id]), bukan di
   * app/layout.tsx, sehingga berpindah di antara ketiganya benar-benar
   * memasang ulang komponennya. Sebuah fetch klien di sini akan berjalan
   * ulang setiap kali, membuat "Daftar"/"Gabung sekarang" berkedip sesaat
   * pada tiap navigasi walau sesinya tidak pernah berubah. Membaca sesi di
   * server sebelum kirim menghilangkan kedip itu sama sekali, bukan hanya
   * mempercepatnya.
   */
  viewer?: { name: string } | null;
};

/**
 * Header menempel di atas dengan latar buram. Garis bawahnya baru muncul setelah
 * halaman digulir, supaya di posisi awal header menyatu dengan hero.
 *
 * Label navigasi mengikuti website live: "Semua deal", "Cara kerja",
 * "Request sample", "Daftar", "Masuk creator".
 */
export default function SiteHeader({ variant = "home", viewer = null }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className="site-header" data-scrolled={scrolled}>
        <div className="shell nav">
          <Link className="brand" href="/" aria-label="TAP by Haluan, ke beranda">
            <Image src="/haluan-logo.png" alt="Haluan Digital Network" width={92} height={24} priority />
            <span className="brand-divider" aria-hidden="true" />
            <strong>TAP</strong>
          </Link>

          <nav className="nav-links" aria-label="Navigasi utama">
            {variant === "home" ? (
              <>
                <Link href="/deals">Semua deal</Link>
                <Link href="/#cara-kerja">Cara kerja</Link>
                <Link href="/request-sample">Request sample</Link>
                {viewer ? null : <Link href="/daftar">Daftar</Link>}
              </>
            ) : (
              <>
                <Link href="/">Home</Link>
                <Link href="/request-sample">Request sample</Link>
                {viewer ? null : <Link href="/daftar">Daftar</Link>}
              </>
            )}
          </nav>

          <div className="nav-actions">
            <a className="nav-session" href={viewer ? "/dashboard" : "/daftar?mode=login"}>
              {viewer ? `${viewer.name.split(" ")[0]} · Dashboard` : "Masuk creator"} <Icon name="arrow-up-right" />
            </a>
            {viewer ? null : (
              <Link className="btn btn-primary" href="/daftar">
                Gabung sekarang
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
