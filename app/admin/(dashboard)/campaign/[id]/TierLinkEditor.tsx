"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCampaignTiers } from "../actions";

type Row = { tierId?: string; linkId?: string; label: string; commission: string; url: string };

export default function TierLinkEditor({
  campaignId,
  commissionType,
  initialRows,
}: {
  campaignId: string;
  commissionType: string;
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows.length ? initialRows : [{ label: "", commission: "", url: "" }]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const isPersentase = commissionType === "PERSENTASE";

  function updateRow(index: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setSaved(false);
    setRows((current) => [...current, { label: "", commission: "", url: "" }]);
  }

  function removeRow(index: number) {
    setSaved(false);
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function save() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await saveCampaignTiers(campaignId, rows);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // saveCampaignTiers mengganti seluruh himpunan baris dalam satu transaksi
      // dan sebelumnya hanya memanggil router.refresh(). Tabel dirender ulang
      // dengan isi yang persis sama, jadi penyimpanan yang berhasil sama sekali
      // tidak terlihat: admin tidak tahu apakah tombolnya bekerja.
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="tier-editor">
      {/* Nama kolom untuk lebar penuh. Di bawah 769px .tier-row menumpuk jadi
          satu kolom dan label per-field di dalam baris yang mengambil alih. */}
      <div className="tier-head" aria-hidden="true">
        <span>{isPersentase ? "Komisi %" : "Komisi"}</span>
        <span>Link afiliasi</span>
        <span>Label tier</span>
        <span />
      </div>

      {rows.map((row, index) => (
        <div className="tier-row" key={row.tierId ?? `new-${index}`}>
          <label>
            <span className="tier-field-label">{isPersentase ? "Komisi %" : "Komisi"}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              value={row.commission}
              disabled={!isPersentase}
              placeholder={isPersentase ? "mis. 12" : "Ketentuan platform"}
              aria-label={`Komisi tier ${index + 1}`}
              onChange={(event) => updateRow(index, { commission: event.target.value })}
            />
          </label>
          <label>
            <span className="tier-field-label">Link afiliasi</span>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={row.url}
              placeholder="https://…"
              aria-label={`Link tier ${index + 1}`}
              onChange={(event) => updateRow(index, { url: event.target.value })}
            />
          </label>
          <label>
            <span className="tier-field-label">Label tier</span>
            <input
              type="text"
              value={row.label}
              placeholder="mis. Skincare"
              aria-label={`Label tier ${index + 1}`}
              onChange={(event) => updateRow(index, { label: event.target.value })}
            />
          </label>
          <span className="table-actions">
            {/* Satu langkah sudah cukup: baris ini baru benar-benar hilang
                setelah "Simpan tier & link" ditekan, jadi salah klik masih bisa
                dibatalkan dengan memuat ulang halaman. */}
            <button type="button" className="danger" disabled={pending} onClick={() => removeRow(index)}>
              Hapus baris
            </button>
          </span>
        </div>
      ))}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="form-ok" role="status">
          {rows.length} tier tersimpan.
        </p>
      ) : null}

      <div className="table-actions tier-actions">
        <button type="button" disabled={pending} onClick={addRow}>
          + Tambah tier
        </button>
        <button className="submit-btn" type="button" disabled={pending} onClick={save}>
          {pending ? "Menyimpan…" : "Simpan tier & link"}
        </button>
      </div>
    </div>
  );
}
