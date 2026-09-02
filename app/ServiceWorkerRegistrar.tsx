"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan /sw.js sekali, untuk seluruh aplikasi.
 *
 * Sebelumnya satu-satunya pendaftaran di repo ini ada di dalam handler enable()
 * PushToggle, jadi service worker-nya hanya hidup setelah seorang creator yang
 * sudah masuk menekan "Aktifkan" di halaman notifikasi. Dua akibatnya:
 *
 *   1. Cadangan offline tidak pernah aktif bagi hampir semua orang, padahal
 *      manifest menyatakan display: "standalone" — jendela tanpa address bar
 *      yang jatuh ke halaman error browser begitu jaringan putus.
 *   2. Kalau pendaftarannya digusur browser, PushToggle hanya memanggil
 *      getRegistration() dan melaporkan "off". Tidak ada yang mendaftar ulang,
 *      jadi push mati diam-diam sampai creator mengaktifkannya lagi secara manual.
 *
 * Menunggu load: pendaftaran service worker ikut berebut bandwidth dengan
 * render pertama, dan halaman ini punya anggaran LCP yang harus dijaga.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Mode privat dan beberapa kebijakan perusahaan memblokir pendaftaran.
        // Aplikasinya tetap berjalan penuh secara online; yang hilang hanya
        // cadangan offline-nya.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
