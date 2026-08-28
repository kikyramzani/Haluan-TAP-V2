"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleSavedCampaign } from "../../dashboard/tersimpan/actions";

type Props = {
  /** Real Prisma Campaign.id (the FK SavedCampaign points at), not the slug in the URL. */
  campaignId: string;
  initialSaved: boolean;
  isSignedIn: boolean;
  returnTo: string;
};

/**
 * Per the doc, the save/bookmark toggle only shows on the brand detail page
 * (/deal/[slug]), never on the /deals catalog grid. A signed-out visitor
 * gets a plain link into the sign-in flow instead of a toggle.
 */
export default function SaveCampaignButton({ campaignId, initialSaved, isSignedIn, returnTo }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  if (!isSignedIn) {
    return (
      <Link className="btn btn-secondary" href={`/daftar?mode=login&returnTo=${encodeURIComponent(returnTo)}`}>
        <span aria-hidden="true">☆</span> Simpan campaign
      </Link>
    );
  }

  function toggle() {
    startTransition(async () => {
      const result = await toggleSavedCampaign(campaignId);
      if ("saved" in result) setSaved(result.saved);
    });
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={toggle} disabled={pending} aria-pressed={saved}>
      <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? "Tersimpan" : "Simpan campaign"}
    </button>
  );
}
