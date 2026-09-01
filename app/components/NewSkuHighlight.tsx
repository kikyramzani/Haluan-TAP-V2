import Link from "next/link";
import type { Campaign } from "../../lib/catalog";
import { classifyExpiry, isActionable } from "../../lib/campaign-flags";
import { formatCommission } from "../../lib/commission";
import BrandMark from "./BrandMark";
import Icon from "./Icon";

type Props = {
  campaigns: readonly Campaign[];
};

const MAX_SHOWN = 8;

/**
 * Baris SKU baru.
 *
 * Penandanya dipasang admin lewat CMS. Tidak ada kolom "New SKU" di sheet mana
 * pun, sehingga daftar ini kosong sampai ada yang benar-benar ditandai. Saat
 * kosong, sectionnya tidak dirender sama sekali: sebuah baris kosong berlabel
 * "SKU baru" akan terbaca seperti data yang gagal dimuat.
 *
 * Campaign yang sudah berakhir dibuang di sini. SKU baru yang tidak bisa
 * diambil lagi bukan sorotan, itu hanya menyita perhatian.
 */
export default function NewSkuHighlight({ campaigns }: Props) {
  const live = campaigns.filter((item) => isActionable(classifyExpiry(item.expiresAt)));
  if (!live.length) return null;

  const shown = live.slice(0, MAX_SHOWN);

  return (
    <section className="shell section" id="new-sku" aria-labelledby="new-sku-heading">
      <div className="catalog-head">
        <div>
          <p className="eyebrow">Baru masuk</p>
          <h2 id="new-sku-heading">SKU baru di TikTok Shop dan Shopee.</h2>
          <p>
            Produk yang baru dibuka brand untuk creator Haluan. Rate dan benefit tetap mengikuti ketentuan campaign
            masing-masing.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/deals">
          Lihat semua deal <Icon name="arrow-up-right" />
        </Link>
      </div>

      <ul className="new-sku-list">
        {shown.map((campaign) => (
          <li key={`${campaign.platform}-${campaign.id}`}>
            <Link className="new-sku-card" href={`/deal/${campaign.id}`}>
              <BrandMark brand={campaign.brand} logoOverride={campaign.image} />
              <span className="new-sku-body">
                <strong>{campaign.brand}</strong>
                <span className="new-sku-meta">
                  {campaign.category} · {campaign.platform}
                </span>
              </span>
              <span className="new-sku-rate">
                {campaign.commission === null ? "Benefit" : formatCommission(campaign.commission)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
