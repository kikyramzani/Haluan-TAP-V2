"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { track } from "@vercel/analytics";

type Viewer = {
  name: string;
  phone: string;
  membership: "pending" | "verified" | "rejected";
  tiktokUsername?: string;
  recipientName?: string;
  address?: string;
};
type SampleOption = { brand: string; platform: "TikTok" | "Shopee" };
type GateCheck = { allowed: true } | { allowed: false; reason: string; message: string };
/** Tagged with the campaign key it was computed for, so a stale result from a
 * just-abandoned selection is never shown against the new one — the render
 * below only trusts `gate` when its `key` still matches the current pick.
 * `result: null` means the check itself failed (network/server error) — that
 * is never treated as a block, only as "nothing to show". Whether a check is
 * still in flight is derived at render time from the absence of an entry for
 * the current key, the same way app/components/CampaignSheet.tsx derives its
 * `loading` flag, rather than a separately-managed boolean. */
type GateState = { key: string; result: GateCheck | null };

export default function RequestSamplePage() {
  const [requestId, setRequestId] = useState("");
  const [campaigns, setCampaigns] = useState<SampleOption[]>([]);
  const [campaignQuery, setCampaignQuery] = useState("");
  const [campaignError, setCampaignError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [gate, setGate] = useState<GateState | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedBrand = params.get("brand") ?? "";
    const requestedPlatform = params.get("platform") === "Shopee" ? "Shopee" : "TikTok";
    Promise.all([
      fetch("/api/campaigns").then((response) => {
        if (!response.ok) throw new Error("catalog");
        return response.json();
      }),
      fetch("/api/campaigns?platform=shopee").then((response) => {
        if (!response.ok) throw new Error("shopee-catalog");
        return response.json();
      }),
      fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([catalog, shopeeCatalog, session]) => {
        const options: SampleOption[] = [
          ...(catalog.campaigns as Array<{ brand: string; hasSample: boolean }>).filter((campaign) => campaign.hasSample).map((campaign) => ({ brand: campaign.brand, platform: "TikTok" as const })),
          ...(shopeeCatalog.campaigns as Array<{ brand: string; hasSample: boolean }>).filter((campaign) => campaign.hasSample).map((campaign) => ({ brand: campaign.brand, platform: "Shopee" as const })),
        ];
        setCampaigns(options);
        if (requestedBrand) {
          const requested = options.find((option) => option.brand === requestedBrand && option.platform === requestedPlatform) ?? options.find((option) => option.brand === requestedBrand);
          if (requested) setCampaignQuery(`${requested.brand} · ${requested.platform}`);
        }
        setViewer((session.user as Viewer | null) ?? null);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setAuthChecked(true));
  }, []);

  // Evaluate the gate as soon as a campaign is picked, so a creator sees why
  // they can't request before filling out the whole form — not just after
  // submitting. This is a convenience pre-check only; the server re-runs the
  // full gate at actual submission regardless (see submit() below).
  useEffect(() => {
    const selected = campaigns.find((option) => `${option.brand} · ${option.platform}` === campaignQuery);
    if (!viewer || viewer.membership !== "verified" || !selected) return;
    const key = `${selected.brand}·${selected.platform}`;
    const controller = new AbortController();
    fetch(`/api/sample-requests/gate?brand=${encodeURIComponent(selected.brand)}&platform=${encodeURIComponent(selected.platform)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: GateCheck) => setGate({ key, result: payload }))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setGate({ key, result: null });
      });
    return () => controller.abort();
  }, [viewer, campaignQuery, campaigns]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCampaign = campaigns.find((option) => `${option.brand} · ${option.platform}` === campaignQuery);
    if (!selectedCampaign) {
      setCampaignError("Pilih campaign yang tersedia dari daftar hasil pencarian.");
      return;
    }
    setBusy(true);
    setNotice("");
    setCampaignError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    // Brands want the components spelled out and never merged into one blurred line,
    // so each is captured in its own field and composed here into the record.
    const address = [
      values.street,
      values.rtRw ? `RT/RW ${values.rtRw}` : "",
      values.kelurahan ? `Kel. ${values.kelurahan}` : "",
      values.kecamatan ? `Kec. ${values.kecamatan}` : "",
      values.kabupaten,
      values.provinsi,
      values.kodePos,
    ].map((part) => String(part ?? "").trim()).filter(Boolean).join(", ");
    try {
      const response = await fetch("/api/sample-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand: selectedCampaign.brand,
          platform: selectedCampaign.platform,
          username: values.username,
          profileUrl: values.profile,
          recipientName: values.recipientName,
          phone: values.phone,
          address,
          commitment: values.commitment === "on",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      track("sample_request_submit", { brand: selectedCampaign.brand, platform: selectedCampaign.platform });
      setRequestId(payload.request.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  const selectedCampaign = campaigns.find((option) => `${option.brand} · ${option.platform}` === campaignQuery) ?? null;
  const selectedKey = selectedCampaign ? `${selectedCampaign.brand}·${selectedCampaign.platform}` : null;
  const gateEntry = gate && gate.key === selectedKey ? gate : null;
  const gateResult = gateEntry?.result ?? null;
  const gateChecking = Boolean(selectedCampaign) && viewer?.membership === "verified" && !gateEntry;
  const returnTo = `/request-sample${selectedCampaign ? `?brand=${encodeURIComponent(selectedCampaign.brand)}&platform=${selectedCampaign.platform}` : ""}`;
  const profileUrl = viewer?.tiktokUsername
    ? `https://www.tiktok.com/@${viewer.tiktokUsername.replace(/^@/, "")}`
    : "";

  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="TAP by Haluan home">
          <Image src="/haluan-logo.png" alt="Haluan Digital Network" width={107} height={35} />
          <span className="brand-divider" />
          <strong>TAP</strong>
        </Link>
        <Link className="back-link" href="/deals">← Kembali ke katalog</Link>
      </nav>
      <section className="form-page shell">
        <aside className="form-intro">
          <span className="eyebrow"><span className="live-dot" /> Product sample</span>
          <h1>Coba produknya.<br /><em>Bikin kontennya.</em></h1>
          <p>Request sample dari campaign pilihan. Khusus creator Haluan yang sudah terverifikasi dan siap membuat konten sesuai brief.</p>
          <div className="steps">
            <div><strong>01</strong><span><b>Pilih campaign</b>Hanya brand dengan sample aktif yang tampil.</span></div>
            <div><strong>02</strong><span><b>Review Haluan</b>Profil, brief, dan kuota akan diperiksa.</span></div>
            <div><strong>03</strong><span><b>Pantau pengiriman</b>Status selalu tersedia di dashboard.</span></div>
          </div>
        </aside>
        <div className="form-panel">
          {!authChecked ? (
            // A sentence next to a spinner tells somebody to wait without telling
            // them what for. Showing the shape of the form that is coming, and the
            // reason for the pause, makes the wait legible instead of empty.
            <div className="sample-skeleton" aria-live="polite" aria-busy="true">
              <div className="sample-skeleton-head">
                <span className="kicker">Menyiapkan formulir</span>
                <p>Kami mencocokkan akunmu dengan master MCN dan mengambil daftar campaign yang masih membuka sample.</p>
              </div>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-field" />
              <div className="skeleton-two">
                <div><div className="skeleton-line skeleton-label" /><div className="skeleton-line skeleton-field" /></div>
                <div><div className="skeleton-line skeleton-label" /><div className="skeleton-line skeleton-field" /></div>
              </div>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-field" />
              <div className="skeleton-line skeleton-button" />
              <span className="sr-only">Memeriksa akses creator</span>
            </div>
          ) : loadFailed ? (
            // Not a stack trace and not a dead end: say which part failed, keep the
            // catalogue reachable, and offer the one action that usually works.
            <div className="sample-access-state">
              <span className="sample-access-icon" aria-hidden="true">↻</span>
              <span className="kicker">Koneksi terputus</span>
              <h2>Daftar campaign belum bisa dimuat.</h2>
              <p>Formulirnya baik-baik saja. Yang gagal adalah pengambilan daftar campaign dengan sample aktif. Biasanya ini sementara.</p>
              <button className="primary-btn" type="button" onClick={() => window.location.reload()}>Coba muat ulang <b>↻</b></button>
              <Link className="member-link" href="/deals">Lihat katalog dulu</Link>
            </div>
          ) : requestId ? (
            <div className="success-state">
              <span>✓</span>
              <h2>Request tersimpan.</h2>
              <p>ID request kamu <b>{requestId}</b>. Tim Haluan akan memprosesnya melalui status review, approval, dan pengiriman yang dapat dipantau di dashboard.</p>
              <Link href="/dashboard">Pantau di dashboard →</Link>
            </div>
          ) : !viewer ? (
            <div className="sample-access-state">
              <span className="sample-access-icon" aria-hidden="true">↗</span>
              <span className="kicker">Creator access</span>
              <h2>Masuk sebelum mengisi request.</h2>
              <p>Data profil dan alamatmu dapat dipakai kembali, jadi kamu tidak perlu mengulang formulir setiap kali meminta sample.</p>
              <Link className="primary-btn" href={`/daftar?mode=login&returnTo=${encodeURIComponent(returnTo)}`}>Masuk creator <b>↗</b></Link>
              <Link className="member-link" href={`/daftar?returnTo=${encodeURIComponent(returnTo)}`}>Belum punya akun? Daftar gratis</Link>
            </div>
          ) : viewer.membership !== "verified" ? (
            <div className="sample-access-state">
              <span className="sample-access-icon" aria-hidden="true">○</span>
              <span className="kicker">Verifikasi membership</span>
              <h2>{viewer.membership === "rejected" ? "Profilmu perlu diperbaiki." : "Verifikasi MCN sedang diproses."}</h2>
              <p>{viewer.membership === "rejected" ? "Perbarui data creator agar tim Haluan dapat memeriksa ulang akunmu." : "Lengkapi profil creator untuk membantu tim mencocokkan akunmu dengan master MCN."}</p>
              <Link className="primary-btn" href="/dashboard#profile">Buka dashboard <b>↗</b></Link>
              <Link className="member-link" href="/deals">Lihat katalog sementara</Link>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="sample-access-state">
              <span className="sample-access-icon" aria-hidden="true">◇</span>
              <span className="kicker">Belum ada sample</span>
              <h2>Tidak ada campaign yang membuka sample saat ini.</h2>
              <p>Daftar ini berubah ketika brand membuka kuota baru. Katalog deal tetap bisa kamu pakai sekarang, dan halaman ini akan terisi begitu ada sample aktif.</p>
              <Link className="primary-btn" href="/deals">Lihat katalog deal <b>↗</b></Link>
              <Link className="member-link" href="/dashboard">Kembali ke dashboard</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="form-heading"><span>Request form</span><b>± 2 menit</b></div>
              <label><span>Cari campaign dengan sample tersedia</span><input name="campaign" list="sample-campaign-options" value={campaignQuery} onChange={(event) => { setCampaignQuery(event.target.value); setCampaignError(""); }} placeholder="Ketik nama brand lalu pilih dari daftar…" autoComplete="off" aria-invalid={campaignError ? "true" : "false"} aria-describedby={campaignError ? "campaign-error" : undefined} required/><datalist id="sample-campaign-options">{campaigns.map((item) => <option key={`${item.platform}-${item.brand}`} value={`${item.brand} · ${item.platform}`}/>)}</datalist>{campaignError && <small id="campaign-error" className="field-error" role="alert">{campaignError}</small>}{!campaignError && gateChecking && <small className="field-hint">Memeriksa ketersediaan sample…</small>}{!campaignError && !gateChecking && gateResult && !gateResult.allowed && <small className="field-error" role="alert">{gateResult.message}</small>}</label>
              <div className="two-col"><label><span>Nama penerima</span><input name="recipientName" defaultValue={viewer.recipientName || viewer.name} placeholder="Nama lengkap" autoComplete="name" required /></label><label><span>Nomor WhatsApp</span><input name="phone" type="tel" inputMode="tel" defaultValue={viewer.phone} placeholder="08xxxxxxxxxx" autoComplete="tel" required /></label></div>
              <label><span>Username creator</span><input name="username" defaultValue={viewer.tiktokUsername || ""} placeholder="@username" autoComplete="off" required /></label>
              <label><span>Link profil creator</span><input name="profile" type="url" defaultValue={profileUrl} placeholder="https://tiktok.com/@username" inputMode="url" required /></label>
              <label><span>Alamat lengkap (nama jalan, nomor, patokan)</span><textarea name="street" rows={2} placeholder="Jl. Contoh No. 12, RT sebutkan di bawah" autoComplete="street-address" required /></label>
              <div className="two-col">
                <label><span>RT / RW</span><input name="rtRw" placeholder="001/002" autoComplete="off" required /></label>
                <label><span>Kelurahan / Desa</span><input name="kelurahan" placeholder="Kelurahan" autoComplete="off" required /></label>
              </div>
              <div className="two-col">
                <label><span>Kecamatan</span><input name="kecamatan" placeholder="Kecamatan" autoComplete="address-level3" required /></label>
                <label><span>Kabupaten / Kota</span><input name="kabupaten" placeholder="Kabupaten atau Kota" autoComplete="address-level2" required /></label>
              </div>
              <div className="two-col">
                <label><span>Provinsi</span><input name="provinsi" placeholder="Provinsi" autoComplete="address-level1" required /></label>
                <label><span>Kode pos</span><input name="kodePos" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="12345" autoComplete="postal-code" required /></label>
              </div>
              <label className="checkbox"><input name="commitment" type="checkbox" required /><span>Saya bersedia membuat konten sesuai brief dan timeline campaign.</span></label>
              <button className="submit-btn" type="submit" disabled={busy || gateResult?.allowed === false}>{busy ? "Menyimpan…" : "Kirim request"} <span>↗</span></button>
              {notice && <p className="form-error" role="alert">{notice}</p>}
              <p className="form-note">Request tidak otomatis disetujui. Kecocokan profil dan kuota campaign tetap diverifikasi oleh tim Haluan.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
