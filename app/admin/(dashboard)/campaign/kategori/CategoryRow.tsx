"use client";

import { useActionState } from "react";
import ConfirmButton from "../../ConfirmButton";
import { renameCategory, deleteCategory } from "./actions";

export type CategoryRowData = { id: string; name: string; slug: string; brandCount: number };

export default function CategoryRow({ category }: { category: CategoryRowData }) {
  const [renameState, renameAction, renamePending] = useActionState(renameCategory, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCategory, null);

  return (
    <tr>
      <td>
        <form action={renameAction} className="two-col inline-edit">
          <input type="hidden" name="id" value={category.id} />
          <input name="name" defaultValue={category.name} required maxLength={80} aria-label={`Nama kategori ${category.name}`} />
          <button className="submit-btn" type="submit" disabled={renamePending}>
            {renamePending ? "Menyimpan…" : "Simpan"}
          </button>
        </form>
        {renameState?.error ? (
          <p className="form-error" role="alert">
            {renameState.error}
          </p>
        ) : null}
        {renameState?.success ? (
          <p className="form-ok" role="status">
            Nama kategori tersimpan.
          </p>
        ) : null}
      </td>
      <td>{category.slug}</td>
      <td className="numeric">{category.brandCount}</td>
      <td className="table-actions">
        <form action={deleteAction}>
          <input type="hidden" name="id" value={category.id} />
          <ConfirmButton className="danger" confirmLabel="Ya, hapus" pendingLabel="Menghapus…" pending={deletePending}>
            Hapus
          </ConfirmButton>
        </form>
        {deleteState?.error ? (
          <p className="form-error" role="alert">
            {deleteState.error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
