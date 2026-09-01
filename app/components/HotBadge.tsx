import type { Campaign } from "../../lib/catalog";
import type { HotBadge as HotBadgeId } from "../../lib/hot-deals-config";
import { classifyExpiry, isActionable } from "../../lib/campaign-flags";
import Icon, { type IconName } from "./Icon";

/**
 * Satu sumber kebenaran untuk badge popularitas: label, ikon, urutan, dan
 * aturan "masih berlaku". Tiga permukaan membacanya. Badge di kartu, label
 * chip, dan hitungan chip, jadi memisahkannya akan membuat hitungan chip bisa
 * berbeda dari kartu yang ada di baliknya.
 *
 * Nilainya sendiri berasal dari cron malam (CampaignEngagementStat), bukan
 * dihitung di sini. Lihat lib/hot-deals-config.ts untuk ambangnya.
 */
export const HOT_BADGE_LABEL: Record<HotBadgeId, string> = {
  TOP_BRAND: "Brand pilihan",
  TRENDING: "Trending",
  HIGH_CONVERSION: "Tinggi konversi",
  HIGH_DEMAND: "Banyak peminat",
};

export const HOT_BADGE_ICON: Record<HotBadgeId, IconName> = {
  TOP_BRAND: "crown-simple",
  TRENDING: "trend-up",
  HIGH_CONVERSION: "chart-line-up",
  // Sinyalnya memang jumlah simpanan + request sample, jadi ikon bookmark
  // adalah gambaran yang jujur, bukan sekadar yang tersedia.
  HIGH_DEMAND: "bookmark-simple",
};

/** Urutan prioritas cron, dipakai juga untuk urutan chip. */
export const HOT_BADGE_ORDER: readonly HotBadgeId[] = ["TOP_BRAND", "TRENDING", "HIGH_CONVERSION", "HIGH_DEMAND"];

/**
 * Gerbang kedua setelah status ACTIVE (yang sudah disaring di
 * lib/catalog-db.ts): sebuah campaign bisa berstatus ACTIVE tapi tanggalnya
 * sudah lewat. Deal yang sudah mati tidak boleh membawa badge popularitas.
 */
export function liveHotBadge(campaign: Campaign): HotBadgeId | null {
  if (!campaign.hotBadge) return null;
  return isActionable(classifyExpiry(campaign.expiresAt)) ? campaign.hotBadge : null;
}

export default function HotBadge({ badge }: { badge: HotBadgeId }) {
  return (
    <span className={`badge badge-hot-${badge.toLowerCase().replace(/_/g, "-")}`}>
      <Icon name={HOT_BADGE_ICON[badge]} /> {HOT_BADGE_LABEL[badge]}
    </span>
  );
}
