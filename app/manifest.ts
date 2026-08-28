import type { MetadataRoute } from "next";

/**
 * Manifest PWA.
 *
 * Sengaja tanpa service worker. Katalog memuat komisi dan status sample, dan
 * angka semacam itu tidak boleh pernah tampil dari cache basi — jadi aplikasi
 * ini bisa dipasang ke home screen dan berjalan standalone, tapi tetap selalu
 * mengambil data dari jaringan.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TAP by Haluan Digital Network",
    short_name: "TAP",
    description:
      "Cari campaign brand yang sedang buka peluang creator. Komisi, jumlah campaign, dan status sample support dalam satu tempat.",
    id: "/",
    start_url: "/deals",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "id",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "shopping", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Semua campaign", short_name: "Campaign", url: "/deals" },
      { name: "Request sample", short_name: "Sample", url: "/request-sample" },
    ],
  };
}
