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
  const router = useRouter();
  const isPersentase = commissionType === "PERSENTASE";

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { label: "", commission: "", url: "" }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function save() {
    setError("");
    startTransition(async () => {
      const result = await saveCampaignTiers(campaignId, rows);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="tier-editor">
      {rows.map((row, index) => (
        <div className="tier-row" key={row.tierId ?? `new-${index}`}>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={row.commission}
            disabled={!isPersentase}
            placeholder={isPersentase ? "Komisi %" : "Ketentuan platform"}
            aria-label={`Komisi tier ${index + 1}`}
            onChange={(event) => updateRow(index, { commission: event.target.value })}
          />
          <input
            type="url"
            value={row.url}
            placeholder="https://…"
            aria-label={`Link tier ${index + 1}`}
            onChange={(event) => updateRow(index, { url: event.target.value })}
          />
          <input
            type="text"
            value={row.label}
            placeholder="Label tier"
            aria-label={`Label tier ${index + 1}`}
            onChange={(event) => updateRow(index, { label: event.target.value })}
          />
          <span className="table-actions">
            <button type="button" className="danger" disabled={pending} onClick={() => removeRow(index)}>
              Hapus
            </button>
          </span>
        </div>
      ))}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="table-actions">
        <button type="button" disabled={pending} onClick={addRow}>
          + Tambah tier
        </button>
        <button type="button" disabled={pending} onClick={save}>
          {pending ? "Menyimpan…" : "Simpan tier & link"}
        </button>
      </div>
    </div>
  );
}
