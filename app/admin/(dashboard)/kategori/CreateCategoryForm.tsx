"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCategory } from "./actions";

export default function CreateCategoryForm() {
  const [state, formAction, pending] = useActionState(createCategory, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form action={formAction} ref={formRef} className="two-col">
      <label>
        <span>Nama kategori baru</span>
        <input name="name" placeholder="mis. Kesehatan & Kecantikan" required maxLength={80} />
      </label>
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah kategori"}
      </button>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
