"use client";

import { useActionState } from "react";
import { renameCategory, deleteCategory } from "./actions";

export type CategoryRowData = { id: string; name: string; slug: string; brandCount: number };

export default function CategoryRow({ category }: { category: CategoryRowData }) {
  const [renameState, renameAction, renamePending] = useActionState(renameCategory, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCategory, null);

  return (
    <tr>
      <td>
        <form action={renameAction} className="two-col" style={{ gridTemplateColumns: "1fr auto" }}>
          <input type="hidden" name="id" value={category.id} />
          <input name="name" defaultValue={category.name} required maxLength={80} aria-label={`Nama kategori ${category.name}`} />
          <button className="submit-btn" type="submit" disabled={renamePending}>
            {renamePending ? "…" : "Simpan"}
          </button>
        </form>
        {renameState?.error ? (
          <p className="form-error" role="alert">
            {renameState.error}
          </p>
        ) : null}
      </td>
      <td>{category.slug}</td>
      <td className="numeric">{category.brandCount}</td>
      <td className="table-actions">
        <form action={deleteAction}>
          <input type="hidden" name="id" value={category.id} />
          <button className="danger" type="submit" disabled={deletePending}>
            {deletePending ? "Menghapus…" : "Hapus"}
          </button>
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
