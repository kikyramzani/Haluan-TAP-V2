"use client";

import { track } from "@vercel/analytics";
import type { Campaign } from "../../lib/catalog";
import { classifyExpiry, expiryLabel, isActionable, isPromotable } from "../../lib/campaign-flags";
import { formatCommission } from "../../lib/commission";
import BrandMark from "./BrandMark";

type Props = {
  campaign: Campaign;
  onOpen: (campaign: Campaign) => void;
  /** Hanya kartu di atas lipatan pertama yang boleh minta prioritas muat logo. */
  priority?: boolean;
};

/**
 * Kartu brand. Satu implementasi dipakai beranda dan /deals supaya keduanya
 * tidak bisa berbeda pendapat soal isi kartu.
 *
 * Angka utamanya berbeda per platform, karena datanya memang berbeda:
 *
 * - TikTok Shop punya kolom komisi, jadi komisi yang tampil, dan angkanya
 *   adalah nilai TERKECIL milik brand itu: janji lantai, bukan puncak.
 * - Shopee Affiliate tidak punya kolom komisi sama sekali. Menampilkan "—"
 *   besar di sana akan terbaca seperti data yang gagal dibaca, padahal
 *   angkanya memang tidak pernah ada. Kartunya memimpin dengan jumlah
 *   campaign, dan benefit yang membawa ceritanya.
 */
export default function BrandCard({ campaign, onOpen, priority }: Props) {
  const expiry = classifyExpiry(campaign.expiresAt);
  const actionable = isActionable(expiry);
  const promotable = isPromotable(expiry);
  const expiryNote = expiryLabel(expiry);
  const isShopee = campaign.platform === "Shopee Affiliate";
  const hasCommission = campaign.commission !== null;
  const benefits = promotable
    ? [
        campaign.hasSample === true ? "Sample tersedia" : null,
        campaign.specialLivePrice ? "Harga live khusus" : null,
      ].filter((benefit): benefit is string => benefit !== null)
    : [];

  return (
    <article className={`deal-card${actionable ? "" : " deal-card-expired"}`}>
      <div className="deal-card-head">
        <BrandMark brand={campaign.brand} logoOverride={campaign.image} priority={priority} />
        <div className="deal-identity">
          <h3 className="deal-brand-name">{campaign.brand}</h3>
          <p className="deal-category">
            {campaign.category} · {campaign.campaignCount} campaign
          </p>
          {/* Menempel pada kategori, bukan di baris badge bawah: SKU baru adalah
              keterangan tentang brandnya, bukan status campaign seperti sample
              dan tanggal berakhir. */}
          {campaign.newSku ? <span className="badge badge-new-sku">New SKU</span> : null}
        </div>
      </div>

      {isShopee ? (
        // Hampir semua brand Shopee hanya punya satu campaign, jadi angka itu
        // tidak membedakan apa pun. Yang membedakan adalah benefitnya.
        <div className="deal-benefits">
          {benefits.length ? (
            <ul>
              {benefits.map((benefit) => (
                <li key={benefit}>
                  <span aria-hidden="true">✓</span> {benefit}
                </li>
              ))}
            </ul>
          ) : (
            <p className="deal-benefit-empty">Belum ada benefit yang dikonfirmasi brand.</p>
          )}
          <span className="deal-commission-label">Komisi mengikuti ketentuan Shopee</span>
        </div>
      ) : (
        <div className={`deal-commission${hasCommission ? "" : " deal-commission-unknown"}`}>
          <span className="deal-commission-value">{formatCommission(campaign.commission)}</span>
          <span className="deal-commission-label">
            {hasCommission ? (
              <>
                Komisi creator
                {campaign.campaignCount > 1 ? <> · mulai dari</> : null}
              </>
            ) : (
              <>Komisi belum terbaca dari sheet</>
            )}
          </span>
        </div>
      )}

      <div className="deal-flags">
        {!isShopee && promotable && campaign.hasSample === true ? (
          <span className="badge badge-sample">
            <span aria-hidden="true">✓</span> Sample tersedia
          </span>
        ) : null}
        {expiryNote ? (
          <span className={`badge ${expiry.kind === "expired" ? "badge-danger" : "badge-warning"}`}>{expiryNote}</span>
        ) : null}
      </div>

      <div className="deal-footer">
        {actionable ? (
          <button
            className="deal-cta"
            type="button"
            onClick={() => {
              track("commission_cta_click", { brand: campaign.brand, platform: campaign.platform });
              onOpen(campaign);
            }}
          >
            Dapatkan komisi <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <span className="deal-cta" aria-disabled="true">
            Campaign sudah berakhir
          </span>
        )}
      </div>
    </article>
  );
}
