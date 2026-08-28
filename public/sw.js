/**
 * Minimal service worker for web push notifications (Phase 5 scaffold —
 * see AGENTS.md for /dashboard/notifikasi). It has no offline/caching
 * responsibilities: install/activate just take control immediately, and the
 * only real behavior is turning a push event into a visible notification.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "TAP by Haluan", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    payload = { ...payload, body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/dashboard/notifikasi"));
});
