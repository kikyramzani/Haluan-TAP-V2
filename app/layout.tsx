import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/home.css";
import "./styles/catalog.css";
import "./styles/sheet.css";
import "./styles/forms.css";
import "./styles/admin.css";
import "./styles/workspace.css";
import MobileNav from "./MobileNav";
import ServiceWorkerRegistrar from "./ServiceWorkerRegistrar";
import { getCurrentUser } from "../lib/auth";
import { siteUrl } from "../lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "TAP by Haluan · Extra Komisi untuk Creator",
  description:
    "Campaign affiliate pilihan, komisi creator, dan request sample untuk creator Haluan.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "TAP by Haluan · Konten jalan. Komisi naik.",
    description: "Komisi creator, affiliate link, dan product sample untuk creator Haluan.",
    images: [{ url: "/og.jpg", width: 1200, height: 630 }],
    type: "website",
    locale: "id_ID",
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-icon.png",
  },
  appleWebApp: { capable: true, title: "TAP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Terkunci di 5x, bukan dinonaktifkan: pembatasan zoom adalah kegagalan
  // aksesibilitas, tapi tanpa batas atas kontrol standalone jadi mudah tergeser.
  maximumScale: 5,
  /**
   * Satu nilai, dan sekarang ia satu-satunya yang mungkin: aplikasi ini hanya
   * punya satu tema sejak 12 September 2026. Tidak ada lagi toggle yang bisa
   * membuat chrome browser berselisih dengan halamannya.
   *
   * Paper dari BRAND-SYSTEM.md §2.1, dikutip literal karena viewport metadata
   * dirender di server dan tidak bisa membaca token CSS.
   */
  themeColor: "#fcfcfc",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Tab bawah berbeda untuk yang sudah dan belum masuk. Dibaca di server supaya
  // tidak ada kedip "belum masuk" di setiap perpindahan halaman; getCurrentUser
  // pulang null sebelum menyentuh database kalau tidak ada cookie, jadi
  // pengunjung anonim tidak membayar kueri apa pun.
  const viewer = await getCurrentUser().catch(() => null);

  return (
    // Satu tema, jadi tidak ada atribut data-theme dan tidak ada skrip
    // pra-paint yang memulihkannya: keduanya hanya ada untuk mencegah kedip
    // saat tema bisa berbeda dari bawaan, dan kondisi itu sudah tidak ada.
    <html lang="id">
      <body>
        <a className="skip-link" href="#main-content">
          Lewati ke konten utama
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <MobileNav isSignedIn={Boolean(viewer)} />
        <ServiceWorkerRegistrar />
        {/**
         * Keduanya hanya berfungsi di atas infrastruktur Vercel: skripnya
         * dilayani dari /_vercel/insights/script.js, endpoint yang tidak ada di
         * VPS ini sejak aplikasi pindah pada 3 September. Akibatnya SETIAP
         * kunjungan halaman mana pun menembak dua permintaan yang berakhir 404
         * dan menulis galat ke konsol pengunjung — terukur 135 kali dalam satu
         * sapuan audit — sementara datanya tidak pernah sampai ke mana pun.
         *
         * Dirender lagi hanya jika memang berjalan di Vercel, sehingga preview
         * deployment tetap terpantau tanpa membebani produksi.
         */}
        {process.env.VERCEL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
