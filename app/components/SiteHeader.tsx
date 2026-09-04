"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import BrandLogo from "./BrandLogo";

type Props = {
  /** Beranda menautkan ke anchor di halaman yang sama; halaman lain kembali ke home. */
  variant?: "home" | "subpage";
  /**
   * Sesi pemilik, dibaca oleh Server Component pemanggil lewat `getCurrentUser()`
   * dan diteruskan sebagai prop, bukan diambil lewat fetch klien di sini.
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
          <Link className="brand" href="/" aria-label="Haluan TAP, ke beranda">
            <BrandLogo />
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
            {/**
             * data-signed-in, bukan dua elemen berbeda: di ≤600px keduanya
             * berperilaku berlawanan. Saat belum masuk, tautan ini disembunyikan
             * karena tombol "Gabung sekarang" di sebelahnya sudah membawa aksi
             * yang sama. Saat SUDAH masuk, tombol itu tidak dirender sama sekali
             * — dan sebelumnya tautan ini pun ikut disembunyikan, sehingga sisi
             * kanan header benar-benar kosong di setiap ponsel bagi setiap
             * creator yang sudah masuk.
             *
             * Yang tersisa di ≤600px adalah inisialnya saja: satu target bulat
             * 44px yang tetap menjadi satu-satunya jalan dari header menuju
             * dashboard.
             */}
            <a
              className="nav-session"
              data-signed-in={viewer ? "true" : "false"}
              href={viewer ? "/dashboard" : "/daftar?mode=login"}
              aria-label={viewer ? `${viewer.name.split(" ")[0]}, buka dashboard` : undefined}
            >
              {viewer ? (
                <span className="nav-session-avatar" aria-hidden="true">
                  {viewer.name.trim().charAt(0).toUpperCase()}
                </span>
              ) : null}
              <span className="nav-session-label">
                {viewer ? `${viewer.name.split(" ")[0]} · Dashboard` : "Masuk creator"}
              </span>
              <Icon name="arrow-up-right" />
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
