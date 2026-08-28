"use client";

import { useActionState } from "react";
import { mergeBrand } from "../actions";

export default function MergeForm({ brandId }: { brandId: string }) {
  const [state, formAction, pending] = useActionState(mergeBrand, null);
  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <span>DUPLIKAT</span>
          <h2>Gabungkan ke brand lain</h2>
        </div>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        Menyembunyikan brand ini dan menandainya sebagai duplikat dari brand tujuan. Tidak bisa dibatalkan otomatis — ubah manual bila keliru.
      </p>
      <form action={formAction} className="two-col">
        <input type="hidden" name="id" value={brandId} />
        <label>
          <span>Nama brand tujuan</span>
          <input name="targetBrandKey" placeholder="Nama brand yang benar" required />
        </label>
        <button className="submit-btn" type="submit" disabled={pending}>
          {pending ? "Menggabungkan…" : "Gabungkan"}
        </button>
      </form>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
