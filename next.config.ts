import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /**
   * Batas bawaan body Server Action adalah 1MB, sementara lib/image-upload.ts
   * menjanjikan 5MB. Akibatnya foto ponsel biasa (2-5MB) ditolak Next SEBELUM
   * uploadBrandLogo() sempat jalan: yang sampai ke admin adalah error lempar,
   * bukan pesan "Ukuran file maksimal 5MB", dan cabang TOO_LARGE itu sendiri
   * tidak pernah tercapai.
   *
   * 6mb, bukan 5mb, karena batas ini mengukur body HTTP mentah — multipart
   * menambahkan boundary dan header per-bagian di atas ukuran filenya sendiri.
   *
   * Berlaku untuk SELURUH Server Action, bukan hanya unggah logo. Yang menahan
   * penyalahgunaannya tetap requireAdmin() plus rate limit 30/60 detik di
   * uploadBrandLogo().
   */
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  /**
   * Logo unggahan mendarat di Vercel Blob sebagai URL https (lib/image-upload.ts).
   * Tanpa daftar ini next/image MELEMPAR "hostname is not configured" di dalam
   * Server Component — yang jatuh bukan satu kartu, melainkan seluruh /deals.
   * Wajib berangkat bersama pembacaan Brand.logoUrl di lib/catalog-db.ts.
   *
   * Subdomainnya adalah id store yang diberikan Vercel, jadi dicocokkan dengan
   * satu tingkat wildcard. Sama dengan BLOB_HOST_SUFFIX di lib/logo-url.ts;
   * keduanya harus diubah bersama.
   */
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" }],
  },
  /**
   * Produk, Link, dan Kategori pindah ke dalam /admin/campaign sebagai tab.
   * Admin yang sudah menandai halaman lamanya tidak boleh mendarat di 404.
   * Permanen: struktur ini tidak akan dikembalikan.
   */
  /**
   * /favicon.ico dijawab 404 pada setiap kunjungan. Metadata layout sudah
   * menunjuk favicon.svg dan icon-192.png, tetapi browser dan crawler tetap
   * meminta /favicon.ico secara default; ditemukan detektor bug e2e sebagai
   * 404 berulang. Dilayani dari PNG 192px yang sudah ada — tanpa aset baru.
   */
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon-192.png" }];
  },
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
