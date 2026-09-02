import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
import ThemeToggle from "./ThemeToggle";
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
   * Satu nilai, bukan pasangan media.
   *
   * Pasangan prefers-color-scheme yang lama salah membaca aplikasinya sendiri:
   * <html data-theme="light"> adalah bawaan, dan skrip di <head> hanya
   * memulihkan pilihan yang PERNAH disimpan creator — preferensi sistem tidak
   * pernah menyalakan tema gelap dengan sendirinya. Jadi pengguna bersistem
   * gelap yang belum pernah menyentuh toggle mendapat chrome browser #090a0a
   * di atas halaman yang benar-benar terang.
   *
   * ThemeToggle memperbarui <meta name="theme-color"> saat temanya diganti,
   * jadi chrome-nya tetap mengikuti tampilan yang sebenarnya.
   *
   * Paper dari BRAND-SYSTEM.md §2.1, dikutip literal karena viewport metadata
   * dirender di server dan tidak bisa membaca token CSS.
   */
  themeColor: "#fcfcfc",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Tab bawah berbeda untuk yang sudah dan belum masuk. Dibaca di server supaya
  // tidak ada kedip "belum masuk" di setiap perpindahan halaman; getCurrentUser
  // pulang null sebelum menyentuh database kalau tidak ada cookie, jadi
  // pengunjung anonim tidak membayar kueri apa pun.
  const viewer = await getCurrentUser().catch(() => null);

  return (
    // Terang adalah bawaan. Skrip di bawah hanya memulihkan pilihan yang
    // pernah disimpan creator, dijalankan sebelum paint supaya tidak ada
    // kedip tema.
    <html lang="id" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tap-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch(e){}",
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Lewati ke konten utama
        </a>
        <ThemeToggle />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <MobileNav isSignedIn={Boolean(viewer)} />
        <ServiceWorkerRegistrar />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
