"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateKategori } from "./actions";

export type CategoryOption = { id: string; name: string };

export default function KategoriForm({ categories, selectedCategoryIds }: { categories: CategoryOption[]; selectedCategoryIds: string[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateKategori, null);
  const lastHandledState = useRef<typeof state>(null);
  const selected = new Set(selectedCategoryIds);

  useEffect(() => {
    if (state && state !== lastHandledState.current && state.success) {
      lastHandledState.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="admin-request-form">
      <fieldset>
        <legend>Kategori konten (pilih minimal satu)</legend>
        <div className="two-col">
          {categories.map((category) => (
            <label className="checkbox" key={category.id}>
              <input type="checkbox" name="categoryIds" value={category.id} defaultChecked={selected.has(category.id)} />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

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
        {pending ? "Menyimpan…" : "Simpan Kategori"}
      </button>
    </form>
  );
}
