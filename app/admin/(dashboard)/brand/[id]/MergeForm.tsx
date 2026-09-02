"use client";

import { useActionState } from "react";
import ConfirmButton from "../../ConfirmButton";
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
      <p className="admin-hint">
        Menyembunyikan brand ini dan menandainya sebagai duplikat dari brand tujuan. Tidak bisa dibatalkan otomatis, ubah manual bila keliru.
      </p>
      <form action={formAction} className="two-col inline-edit">
        <input type="hidden" name="id" value={brandId} />
        <label>
          <span>Nama brand tujuan</span>
          <input
            name="targetBrandKey"
            placeholder="Nama brand yang benar"
            required
            autoCapitalize="words"
            autoComplete="off"
          />
        </label>
        {/* Salinan di atas menyebut sendiri bahwa aksinya tidak bisa dibatalkan
            otomatis, tapi sampai sekarang ia berjalan pada klik pertama. */}
        <ConfirmButton className="submit-btn danger" confirmLabel="Ya, gabungkan" pendingLabel="Menggabungkan…" pending={pending}>
          Gabungkan
        </ConfirmButton>
      </form>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
