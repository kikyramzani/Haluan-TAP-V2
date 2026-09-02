"use client";

import { useActionState } from "react";
import { updateCampaignAction } from "../actions";

type Campaign = {
  id: string;
  status: string;
  sampleQuota: number | null;
  sampleQuotaRemaining: number | null;
  brief: string | null;
  creatorRequirements: string | null;
  displayOrderWeight: number;
  newSku: boolean;
  specialLivePrice: boolean;
  validUntil: string;
};

export default function CampaignForm({ campaign }: { campaign: Campaign }) {
  const [state, formAction, pending] = useActionState(updateCampaignAction, null);

  return (
    <form action={formAction} className="admin-request-form">
      <input type="hidden" name="id" value={campaign.id} />
      <div className="editor-grid">
        <div className="field">
          <label htmlFor="campaign-status">Status</label>
          <select id="campaign-status" name="status" defaultValue={campaign.status}>
            <option value="ACTIVE">Aktif</option>
            <option value="ENDED">Berakhir</option>
            <option value="HIDDEN">Disembunyikan</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="campaign-quota">Kuota sample</label>
          <input id="campaign-quota" name="sampleQuota" type="number" min={0} step={1} defaultValue={campaign.sampleQuota ?? ""} placeholder="Tanpa batas" />
          <span className="field-hint">
            Tersisa saat ini: {campaign.sampleQuotaRemaining ?? "—"}. Menaikkan kuota otomatis menambah sisa sebesar selisihnya.
          </span>
        </div>
        <div className="field">
          <label htmlFor="campaign-weight">Bobot urutan tampil</label>
          <input id="campaign-weight" name="displayOrderWeight" type="number" step={1} defaultValue={campaign.displayOrderWeight} />
        </div>
        <div className="field">
          <label htmlFor="campaign-valid-until">Berlaku sampai</label>
          <input id="campaign-valid-until" name="validUntil" type="date" defaultValue={campaign.validUntil} />
        </div>
      </div>

      <label>
        <span>Brief campaign</span>
        <textarea name="brief" defaultValue={campaign.brief ?? ""} rows={3} />
      </label>
      <label>
        <span>Syarat creator</span>
        <textarea name="creatorRequirements" defaultValue={campaign.creatorRequirements ?? ""} rows={3} />
      </label>

      <div className="two-col">
        <label className="checkbox">
          <input name="newSku" type="checkbox" defaultChecked={campaign.newSku} />
          <span>SKU baru</span>
        </label>
        <label className="checkbox">
          <input name="specialLivePrice" type="checkbox" defaultChecked={campaign.specialLivePrice} />
          <span>Harga spesial live</span>
        </label>
      </div>

      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="form-submit-row">
        <button className="submit-btn" type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan campaign"}
        </button>
        {/* updateCampaignAction mengembalikan { success: true } sejak awal, tapi
            tidak ada yang pernah merendernya: penyimpanan yang berhasil hanya
            memuat ulang halaman dengan nilai yang sama persis. */}
        {state?.success ? (
          <span className="form-ok" role="status">
            Perubahan campaign tersimpan.
          </span>
        ) : null}
      </div>
    </form>
  );
}
