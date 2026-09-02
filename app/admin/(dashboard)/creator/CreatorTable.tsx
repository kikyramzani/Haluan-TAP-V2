"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkVerifyCreators } from "./actions";

export type CreatorRow = {
  id: string;
  name: string;
  email: string;
  membership: "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
  handle: string;
  followers: number | null;
  joinedAt: string;
};

const MEMBERSHIP_LABEL: Record<CreatorRow["membership"], string> = {
  PENDING: "Pending",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CreatorTable({ creators }: { creators: CreatorRow[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState("");
  const router = useRouter();

  const pendingIds = creators.filter((creator) => creator.membership === "PENDING").map((creator) => creator.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.includes(id));

  function toggleAllPending(checked: boolean) {
    setSelected(checked ? pendingIds : []);
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  }
  function runBulkVerify() {
    setNotice("");
    setDone("");
    const count = selected.length;
    startTransition(async () => {
      const result = await bulkVerifyCreators(selected);
      if ("error" in result) {
        setNotice(result.error);
        return;
      }
      setSelected([]);
      // Sebelumnya satu-satunya tanda berhasil adalah kotak centang yang kosong
      // lagi, pada aksi yang memverifikasi sampai 50 kreator sekaligus.
      setDone(`${count} kreator diverifikasi.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="table-actions" role="group" aria-label="Aksi massal kreator">
        <span>{selected.length} dipilih</span>
        <button type="button" disabled={!selected.length || pending} onClick={runBulkVerify}>
          Verifikasi terpilih
        </button>
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
                <input
                  type="checkbox"
                  aria-label="Pilih semua kreator pending"
                  checked={allPendingSelected}
                  disabled={!pendingIds.length}
                  onChange={(event) => toggleAllPending(event.target.checked)}
                />
              </th>
              <th>Nama</th>
              <th>Email</th>
              <th>Status</th>
              <th>Akun</th>
              <th>Followers</th>
              <th>Bergabung</th>
              <th><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {creators.map((creator) => (
              <tr key={creator.id}>
                <td>
                  {creator.membership === "PENDING" ? (
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${creator.name}`}
                      checked={selected.includes(creator.id)}
                      onChange={(event) => toggleOne(creator.id, event.target.checked)}
                    />
                  ) : null}
                </td>
                <td className="row-brand">
                  <b>{creator.name}</b>
                </td>
                <td>{creator.email}</td>
                <td>
                  <span className={`admin-status membership-${creator.membership.toLowerCase()}`}>{MEMBERSHIP_LABEL[creator.membership]}</span>
                </td>
                <td>{creator.handle}</td>
                <td className="numeric">{creator.followers ?? "—"}</td>
                <td>{formatDate(creator.joinedAt)}</td>
                <td className="table-actions">
                  <Link href={`/admin/creator/${creator.id}`}>Detail</Link>
                </td>
              </tr>
            ))}
            {!creators.length ? (
              <tr>
                <td colSpan={8} className="empty-cell">
                  Belum ada kreator yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
