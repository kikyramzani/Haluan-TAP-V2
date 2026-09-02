import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /**
   * Produk, Link, dan Kategori pindah ke dalam /admin/campaign sebagai tab.
   * Admin yang sudah menandai halaman lamanya tidak boleh mendarat di 404.
   * Permanen: struktur ini tidak akan dikembalikan.
   */
  async redirects() {
    return [
      { source: "/admin/produk", destination: "/admin/campaign/produk", permanent: true },
      { source: "/admin/link", destination: "/admin/campaign/link", permanent: true },
      { source: "/admin/kategori", destination: "/admin/campaign/kategori", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ] }];
  },
};

export default nextConfig;
