"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateDataPribadi } from "./actions";

export type DataPribadiInput = {
  name: string;
  phone: string;
  nickname: string | null;
  bio: string | null;
};

export default function DataPribadiForm({ initial }: { initial: DataPribadiInput }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateDataPribadi, null);
  const lastHandledState = useRef<typeof state>(null);

  useEffect(() => {
    if (state && state !== lastHandledState.current && state.success) {
      lastHandledState.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="admin-request-form">
      <div className="two-col">
        <label>
          <span>Nama lengkap</span>
          <input name="name" defaultValue={initial.name} required minLength={2} maxLength={80} />
        </label>
        <label>
          <span>Panggilan</span>
          <input name="nickname" defaultValue={initial.nickname ?? ""} maxLength={40} placeholder="Nama panggilan" />
        </label>
      </div>
      <label>
        <span>Nomor WhatsApp</span>
        <input name="phone" type="tel" inputMode="tel" defaultValue={initial.phone} required placeholder="08xxxxxxxxxx" />
      </label>
      <label>
        <span>Bio</span>
        <textarea name="bio" rows={4} maxLength={500} defaultValue={initial.bio ?? ""} placeholder="Ceritakan singkat tentang kontenmu" />
      </label>
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
        {pending ? "Menyimpan…" : "Simpan Data Pribadi"}
      </button>
    </form>
  );
}
