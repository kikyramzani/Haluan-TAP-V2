"use client";

import { useActionState } from "react";
import { completeOnboarding } from "./actions";

type Category = { id: string; name: string };

export default function OnboardingForm({ defaultName, defaultPhone, categories }: { defaultName: string; defaultPhone: string; categories: Category[] }) {
  const [state, formAction, pending] = useActionState(completeOnboarding, null);

  return (
    <form action={formAction}>
      <label>
        <span>Nama lengkap</span>
        <input name="name" defaultValue={defaultName} required minLength={2} />
      </label>
      <label>
        <span>Nomor WhatsApp</span>
        <input name="phone" type="tel" inputMode="tel" defaultValue={defaultPhone} placeholder="08xxxxxxxxxx" required />
      </label>
      <fieldset>
        <legend>Kategori konten (pilih minimal satu)</legend>
        <div className="two-col">
          {categories.map((category) => (
            <label className="checkbox" key={category.id}>
              <input type="checkbox" name="categoryIds" value={category.id} />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="checkbox">
        <input name="consent" type="checkbox" required />
        <span>
          Saya menyetujui <a href="/terms">Ketentuan</a> dan <a href="/privacy">Kebijakan Privasi</a> TAP.
        </span>
      </label>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Lanjut ke dashboard"} <span>↗</span>
      </button>
    </form>
  );
}
