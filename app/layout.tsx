import type { Metadata, Viewport } from "next";
import Link from "next/link";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // Gelap adalah bawaan, mengikuti hcommerce. Skrip di bawah hanya memulihkan
    // pilihan yang pernah disimpan creator, dijalankan sebelum paint supaya
    // tidak ada kedip tema.
    <html lang="id" data-theme="dark" suppressHydrationWarning>
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
        <nav className="mobile-nav" aria-label="Navigasi utama">
          <ul>
            <li>
              <Link href="/deals">
                <span className="mobile-nav-icon" aria-hidden="true">
                  ◈
                </span>
                Deal
              </Link>
            </li>
            <li>
              <Link href="/request-sample">
                <span className="mobile-nav-icon" aria-hidden="true">
                  ＋
                </span>
                Sample
              </Link>
            </li>
            <li>
              <Link href="/dashboard">
                <span className="mobile-nav-icon" aria-hidden="true">
                  ◯
                </span>
                Akun
              </Link>
            </li>
          </ul>
        </nav>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
