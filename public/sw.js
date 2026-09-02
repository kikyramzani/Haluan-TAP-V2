/**
 * Service worker: push notification, plus SATU cadangan offline.
 *
 * Aturan yang tidak boleh dilanggar: TIDAK ADA data katalog yang di-cache.
 * Halaman ini memuat komisi dan status sample, dan angka semacam itu tidak
 * boleh pernah tampil dari cache basi. Jadi tidak ada strategi cache-first,
 * tidak ada stale-while-revalidate, dan tidak ada satu pun respons navigasi
 * yang disimpan — setiap permintaan tetap pergi ke jaringan lebih dulu.
 *
 * Yang di-cache hanya /offline.html, satu berkas statis tanpa data apa pun.
 * Tanpa itu, aplikasi yang dipasang (display: standalone) menjatuhkan pengguna
 * ke halaman error bawaan browser di dalam jendela tanpa address bar, tanpa
 * header, dan tanpa satu pun jalan kembali ke aplikasi begitu jaringan putus.
 *
 * HTML biasa dari public/, bukan rute Next: berkas rute akan menautkan chunk
 * CSS dan JS yang tidak ikut di-cache, sehingga halaman offline-nya justru
 * tampil tanpa gaya sama sekali. /offline.html memuat gayanya sendiri inline.
 */

// Dinaikkan saat isi offline.html berubah, supaya klien yang sudah memasang
// PWA tidak menyimpan cangkang versi lama.
const CACHE_NAME = "tap-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // reload: lewati cache HTTP browser supaya versi yang tersimpan benar-benar
      // versi terbaru saat deploy, bukan salinan lama dari disk.
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Buang cache versi lama supaya cangkang offline tidak menumpuk lintas rilis.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/**
 * Hanya navigasi, dan hanya sebagai jaring pengaman.
 *
 * Permintaan lain (data, gambar, chunk) sengaja dibiarkan lewat tanpa disentuh
 * sama sekali: tidak ada handler berarti browser menanganinya sendiri seperti
 * sebelum service worker ini ada.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        // Kalau cangkangnya pun tidak ada, lempar balik ke perilaku bawaan
        // browser alih-alih mengembalikan respons kosong yang membingungkan.
        return cached ?? Response.error();
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "TAP by Haluan", body: "", url: "/dashboard/notifikasi", tag: "tap-notification" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload = { ...payload, body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      // Android meratakan badge jadi siluet monokrom, jadi ikon berwarna
      // di sana hanya jadi gumpalan buram. Aset ini memang satu warna.
      badge: "/icon-badge-96.png",
      // tag: notifikasi baru menggantikan yang lama alih-alih menumpuk jadi
      // deretan panjang di shade. data.url: tiap notifikasi bisa menunjuk
      // halaman yang benar-benar relevan, bukan selalu daftar umum.
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

/**
 * Fokuskan jendela yang sudah ada, jangan buka jendela baru tiap kali.
 *
 * openWindow() tanpa syarat berarti tiga notifikasi membuka tiga jendela.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard/notifikasi";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) await client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

/**
 * Langganan push yang dirotasi browser.
 *
 * Tanpa handler ini, server menyimpan endpoint mati selamanya dan creator
 * berhenti menerima notifikasi tanpa satu pun tanda — tidak di UI, tidak di
 * log. Endpoint lama dilepas lebih dulu supaya barisnya tidak menumpuk.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription?.endpoint;
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;

      try {
        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        if (oldEndpoint) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: oldEndpoint }),
          }).catch(() => undefined);
        }
        // Bentuk datar {endpoint, p256dh, auth}, sama persis dengan yang
        // dikirim PushToggle. /api/push/subscribe menolak bentuk toJSON()
        // bersarang dengan 400.
        const json = fresh.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
        });
      } catch {
        // Tidak ada UI yang bisa disentuh dari sini. Percobaan berikutnya
        // terjadi saat creator membuka /dashboard/notifikasi lagi.
      }
    })(),
  );
});
