"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "not_configured" | "denied" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Converts the VAPID public key (base64url, the format every VAPID key
 * generator emits) into the raw Uint8Array `PushManager.subscribe` expects
 * as `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function subscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth };
}

export default function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("not_configured");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const existing = await registration?.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    }

    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) return;
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscriptionPayload(subscription)),
      });
      if (!response.ok) throw new Error("SUBSCRIBE_FAILED");
      setStatus("on");
    } catch {
      setError("Notifikasi push gagal diaktifkan. Coba lagi.");
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Notifikasi push gagal dinonaktifkan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;

  return (
    <div className="push-toggle">
      <div>
        <b>Notifikasi push</b>
        {status === "unsupported" ? <p>Browser ini tidak mendukung notifikasi push.</p> : null}
        {status === "not_configured" ? <p>Notifikasi push belum dikonfigurasi.</p> : null}
        {status === "denied" ? <p>Notifikasi push diblokir di browser ini. Aktifkan lewat pengaturan izin situs untuk menerimanya.</p> : null}
        {status === "on" || status === "off" ? <p>Dapatkan notifikasi langsung di perangkat ini saat status sample atau campaign baru berubah.</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {status === "on" || status === "off" ? (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={status === "on" ? disable : enable}>
          {status === "on" ? "Nonaktifkan" : "Aktifkan"}
        </button>
      ) : null}
    </div>
  );
}
