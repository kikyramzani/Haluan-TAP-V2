import type { MetadataRoute } from "next";

/**
 * Manifest PWA.
 *
 * Service worker-nya (public/sw.js) TIDAK menyimpan data katalog. Komisi dan
 * status sample berubah setiap hari dan tidak boleh pernah tampil dari cache
 * basi, jadi setiap permintaan tetap pergi ke jaringan lebih dulu. Satu-satunya
 * berkas yang di-cache adalah /offline.html, cangkang statis tanpa data — tanpa
 * itu, jendela standalone menjatuhkan pengguna ke halaman error bawaan browser
 * tanpa satu pun jalan kembali ke aplikasi begitu jaringan putus.
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
    /**
     * Tanpa kunci orientasi.
     *
     * `orientation: "portrait"` sebelumnya mengunci aplikasi terpasang ke
     * potret, termasuk CMS admin — yang berupa grid sidebar 248px plus konten
     * dan justru butuh lanskap di tablet. Tidak ada satu pun layar di sini yang
     * rusak dalam lanskap, jadi tidak ada alasan mencabut pilihan itu dari
     * penggunanya.
     */
    lang: "id",
    dir: "ltr",
    /**
     * Paper brand (#fcfcfc), bukan putih murni. Lihat BRAND-SYSTEM.md §2.1.
     *
     * Satu nilai saja, dan memang harus terang: manifest bersifat statis dan
     * tidak bisa menyatakan sepasang tema, sementara aplikasi ini default-nya
     * terang (<html data-theme="light">) dan hanya menjadi gelap kalau creator
     * memilihnya sendiri. Untuk chrome browser yang mengikuti pilihan itu,
     * lihat syncChromeColor() di app/ThemeToggle.tsx.
     */
    background_color: "#fcfcfc",
    theme_color: "#fcfcfc",
    categories: ["business", "shopping", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Tanpa `icons`, Android merender kotak generik untuk kedua pintasan.
    shortcuts: [
      {
        name: "Semua campaign",
        short_name: "Campaign",
        url: "/deals",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Request sample",
        short_name: "Sample",
        url: "/request-sample",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
