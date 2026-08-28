"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateSocialMedia } from "./actions";

export type SocialMediaInput = {
  tiktokUsername: string;
  tiktokFollowers: number | null;
  instagramUsername: string;
  instagramFollowers: number | null;
  youtubeUsername: string;
  youtubeFollowers: number | null;
  shopeeUsername: string;
  shopeeFollowers: number | null;
  tiktokAffiliateUsername: string;
  tiktokAffiliateFollowers: number | null;
};

const PLATFORMS: Array<{ label: string; usernameField: keyof SocialMediaInput; followersField: keyof SocialMediaInput; placeholder: string }> = [
  { label: "TikTok", usernameField: "tiktokUsername", followersField: "tiktokFollowers", placeholder: "username" },
  { label: "Instagram", usernameField: "instagramUsername", followersField: "instagramFollowers", placeholder: "username" },
  { label: "YouTube", usernameField: "youtubeUsername", followersField: "youtubeFollowers", placeholder: "nama channel" },
  { label: "Shopee", usernameField: "shopeeUsername", followersField: "shopeeFollowers", placeholder: "username" },
  { label: "TikTok Affiliate", usernameField: "tiktokAffiliateUsername", followersField: "tiktokAffiliateFollowers", placeholder: "username" },
];

export default function SocialMediaForm({ initial }: { initial: SocialMediaInput }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateSocialMedia, null);
  const lastHandledState = useRef<typeof state>(null);

  useEffect(() => {
    if (state && state !== lastHandledState.current && state.success) {
      lastHandledState.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="admin-request-form">
      {PLATFORMS.map((platform) => (
        <fieldset key={platform.usernameField}>
          <legend>{platform.label}</legend>
          <div className="two-col">
            <label>
              <span>Username</span>
              <input name={platform.usernameField} defaultValue={initial[platform.usernameField] as string} maxLength={80} placeholder={platform.placeholder} />
            </label>
            <label>
              <span>Followers</span>
              <input name={platform.followersField} type="number" min={0} step={1} defaultValue={(initial[platform.followersField] as number | null) ?? ""} />
            </label>
          </div>
        </fieldset>
      ))}

      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="admin-success" role="status">
          Tersimpan. Profil kamu {state.completeness?.percent}% lengkap.
        </p>
      ) : null}
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan Social Media"}
      </button>
    </form>
  );
}
