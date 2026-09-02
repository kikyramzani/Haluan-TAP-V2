"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkUpdateBrands } from "./actions";
import ConfirmButton from "../ConfirmButton";
import Icon from "../../../components/Icon";

export type BrandRow = {
  id: string;
  displayName: string;
  categoryName: string;
  campaignCount: number;
  hidden: boolean;
  featured: boolean;
};

export default function BrandTable({ brands }: { brands: BrandRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState("");
  const router = useRouter();

  const allSelected = brands.length > 0 && selected.length === brands.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? brands.map((brand) => brand.id) : []);
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }
  const DONE_LABEL: Record<string, string> = {
    activate: "diaktifkan",
    feature: "dijadikan unggulan",
    unfeature: "dicabut dari unggulan",
    archive: "diarsipkan",
  };

  function run(action: "activate" | "feature" | "unfeature" | "archive") {
    setNotice("");
    setDone("");
    const count = selected.length;
    startTransition(async () => {
      const result = await bulkUpdateBrands(selected, action);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      setSelected([]);
      // Sebelumnya satu-satunya tanda bahwa aksi massal berhasil adalah
      // kotak centangnya kosong lagi — pada aksi yang menyentuh sampai 50 baris.
      setDone(`${count} brand ${DONE_LABEL[action]}.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="table-actions" role="group" aria-label="Aksi massal brand">
        <span>{selected.length} dipilih</span>
        <button type="button" disabled={!selected.length || pending} onClick={() => run("activate")}>
          Aktifkan
        </button>
        <button type="button" disabled={!selected.length || pending} onClick={() => run("feature")}>
          Jadikan unggulan
        </button>
        <button type="button" disabled={!selected.length || pending} onClick={() => run("unfeature")}>
          Batalkan unggulan
        </button>
        {/* Pengarsipan massal menyentuh sampai 50 baris sekaligus dan hanya bisa
            dibalik satu per satu, jadi ia butuh langkah kedua. */}
        <ConfirmButton
          className="danger"
          confirmLabel={`Ya, arsipkan ${selected.length}`}
          pendingLabel="Mengarsipkan…"
          pending={pending}
          disabled={!selected.length}
          onConfirm={() => run("archive")}
        >
          Arsipkan
        </ConfirmButton>
        {notice ? (
          <span className="form-error" role="alert">
            {notice}
          </span>
        ) : null}
        {done ? (
          <span className="form-ok" role="status">
            {done}
          </span>
        ) : null}
      </div>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" aria-label="Pilih semua brand" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} />
              </th>
              <th>Nama</th>
              <th>Kategori</th>
              <th>Campaign</th>
              <th>Status</th>
              <th><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id}>
                <td>
                  <input type="checkbox" aria-label={`Pilih ${brand.displayName}`} checked={selected.includes(brand.id)} onChange={(event) => toggleOne(brand.id, event.target.checked)} />
                </td>
                <td className="row-brand">
                  <b>{brand.displayName}</b>
                  {brand.featured ? <small><Icon name="star-fill" /> Unggulan</small> : null}
                </td>
                <td>{brand.categoryName}</td>
                <td className="numeric">{brand.campaignCount}</td>
                <td>
                  <span className={`admin-status status-${brand.hidden ? "archived" : "active"}`}>{brand.hidden ? "Arsip" : "Aktif"}</span>
                </td>
                <td className="table-actions">
                  <Link href={`/admin/brand/${brand.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
            {!brands.length ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Belum ada brand yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
