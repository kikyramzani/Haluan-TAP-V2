"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSavedCampaign } from "./actions";
import Icon from "../../components/Icon";

type Props = {
  campaignId: string;
  slug: string;
  brandName: string;
  categoryName: string;
  platform: "TIKTOK_SHOP" | "SHOPEE_AFFILIATE";
  commissionLabel: string;
};

/**
 * Same .deal-grid/.deal-card cards as the public catalog and the dashboard
 * overview's "Untuk kamu" section (see app/dashboard/page.tsx) — no new card
 * CSS. The remove control sits absolutely positioned inside the (already
 * `position: relative`) .deal-card, as a sibling of the link rather than
 * nested inside it, since a <button> may not nest inside an <a>. The link's
 * `display: contents` keeps its text children (`b`/`small`/`strong`)
 * participating directly in the card's flex column, matching the simple
 * markup shape the dashboard overview already established.
 */
export default function SavedCampaignCard({ campaignId, slug, brandName, categoryName, platform, commissionLabel }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      await toggleSavedCampaign(campaignId);
      router.refresh();
    });
  }

  return (
    <div className="deal-card" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Hapus ${brandName} dari tersimpan`}
        style={{
          position: "absolute",
          top: "var(--space-3)",
          right: "var(--space-3)",
          zIndex: 1,
          border: "1px solid var(--line-strong)",
          background: "var(--surface)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-xs)",
          padding: "4px 8px",
          cursor: pending ? "not-allowed" : "pointer",
          color: "var(--text-muted)",
        }}
      >
        {pending ? "…" : <><Icon name="x" /> Hapus</>}
      </button>
      <Link href={`/deal/${slug}`} style={{ display: "contents" }}>
        <b>{brandName}</b>
        <small>
          {categoryName} · {platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop"}
        </small>
        <strong>{commissionLabel}</strong>
      </Link>
    </div>
  );
}
