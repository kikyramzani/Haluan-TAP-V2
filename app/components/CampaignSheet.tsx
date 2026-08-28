"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Campaign } from "../../lib/catalog";
import { classifyExpiry, expiryLabel } from "../../lib/campaign-flags";
import { formatCommission } from "../../lib/commission";
import BrandMark from "./BrandMark";
import AffiliateLinkField from "./AffiliateLinkField";
import { useFocusTrap } from "./useFocusTrap";

type PrimaryLink = {
  label: string;
  url: string;
  commission: number | null;
  hasSample: boolean;
  openUrl: string;
};

type Props = {
  campaign: Campaign | null;
  onClose: () => void;
};

/**
 * Detail brand.
 *
 * Hanya satu link yang ditawarkan — tier dengan komisi terkecil — jadi creator
 * tidak perlu memilih apa pun. Linknya ditampilkan apa adanya supaya bisa
 * disalin, bukan disembunyikan di balik tombol.
 *
 * Pembungkus ini memasang ulang isinya lewat `key`, sehingga berpindah brand
 * mengosongkan state dengan sendirinya, tanpa efek yang menyetel state.
 */
export default function CampaignSheet({ campaign, onClose }: Props) {
  if (!campaign) return null;
  return <SheetContent key={campaign.id} campaign={campaign} onClose={onClose} />;
}

function SheetContent({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [link, setLink] = useState<PrimaryLink | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useFocusTrap(true, onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}/links`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload) => setLink(payload.link ?? null))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [campaign.id]);

  const loading = link === null && !failed;
  const expiry = classifyExpiry(campaign.expiresAt);
  const expiryNote = expiryLabel(expiry);
  const isShopee = campaign.platform === "Shopee Affiliate";

  return (
    <div className="sheet-backdrop" data-open="true">
      {/* Tirai adalah tombol sungguhan, bukan div dengan onClick, supaya
          menutup lewat keyboard dan screen reader tetap mungkin. */}
      <button className="sheet-scrim" type="button" onClick={onClose} tabIndex={-1} aria-label="Tutup detail campaign" />
      <div
        className="sheet"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        aria-busy={loading}
      >
        <header className="sheet-header">
          <BrandMark brand={campaign.brand} logoOverride={campaign.image} size={52} />
          <div className="sheet-title">
            <h2 id="sheet-title">{campaign.brand}</h2>
            <p>
              {campaign.category} · {campaign.platform}
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose} aria-label="Tutup detail campaign">
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="sheet-body">
          <dl className="sheet-metrics">
            {!isShopee ? (
              <div className="metric-tile">
                <dt>Komisi creator</dt>
                <dd>{formatCommission(campaign.commission)}</dd>
              </div>
            ) : null}
            {campaign.hasSample !== null ? (
              <div className="metric-tile">
                <dt>Sample</dt>
                <dd style={{ fontSize: "var(--text-lead)" }}>{campaign.hasSample ? "Tersedia" : "Belum tersedia"}</dd>
              </div>
            ) : null}
            {campaign.expiresAt ? (
              <div className="metric-tile metric-tile-wide">
                <dt>Berlaku hingga</dt>
                <dd style={{ fontSize: "var(--text-lead)" }}>
                  {campaign.expiresAt}
                  {expiryNote ? <span className="metric-note">{expiryNote}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>

          <section className="sheet-section">
            <h3>Link affiliate</h3>
            {loading ? (
              <span className="skeleton-line" style={{ width: "100%", height: 44 }} />
            ) : failed || !link ? (
              <p className="sheet-note">Link affiliate belum bisa dimuat. Coba tutup dan buka lagi sebentar.</p>
            ) : (
              <AffiliateLinkField url={link.url} openUrl={link.openUrl} />
            )}
          </section>
        </div>

        <footer className="sheet-footer">
          <Link className="btn btn-secondary btn-block" href={`/deal/${campaign.id}`}>
            Bagikan halaman brand
          </Link>
          {campaign.hasSample ? (
            // Sama seperti link "Request sample" di halaman deal penuh: brand dan
            // platform sudah terisi, supaya membuka alur ini dari modal katalog
            // tidak kehilangan konteks yang didapat dari halaman deal.
            <Link
              className="btn btn-ghost btn-block"
              href={`/request-sample?brand=${encodeURIComponent(campaign.brand)}&platform=${
                campaign.platform === "Shopee Affiliate" ? "Shopee" : "TikTok"
              }`}
            >
              Request sample ↗
            </Link>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
