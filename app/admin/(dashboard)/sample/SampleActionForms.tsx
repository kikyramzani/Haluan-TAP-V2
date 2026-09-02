"use client";

import { useActionState } from "react";
import { approveSampleRequest, rejectSampleRequest, markSampleShipped, markSampleCompleted } from "./actions";
import type { SampleRequestStatus } from "./labels";

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
}

export default function SampleActionForms({ id, status }: { id: string; status: SampleRequestStatus }) {
  const [approveState, approveAction, approvePending] = useActionState(approveSampleRequest, null);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectSampleRequest, null);
  const [shipState, shipAction, shipPending] = useActionState(markSampleShipped, null);
  const [completeState, completeAction, completePending] = useActionState(markSampleCompleted, null);

  if (status === "PENDING") {
    return (
      <div className="two-col">
        <form action={approveAction} className="admin-request-form">
          <input type="hidden" name="id" value={id} />
          <label>
            <span>Catatan persetujuan (opsional)</span>
            <textarea name="approveNote" rows={2} />
          </label>
          <ErrorText error={approveState?.error} />
          <button className="submit-btn" type="submit" disabled={approvePending}>
            {approvePending ? "Menyimpan…" : "Setujui"}
          </button>
        </form>

        <form action={rejectAction} className="admin-request-form">
          <input type="hidden" name="id" value={id} />
          <label>
            <span>Alasan penolakan</span>
            <textarea name="rejectionReason" rows={2} required />
          </label>
          <ErrorText error={rejectState?.error} />
          <button className="submit-btn" type="submit" disabled={rejectPending}>
            {rejectPending ? "Menyimpan…" : "Tolak"}
          </button>
        </form>
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <form action={shipAction} className="admin-request-form">
        <input type="hidden" name="id" value={id} />
        <div className="two-col">
          <label>
            <span>Kurir</span>
            <input name="carrier" required maxLength={60} />
          </label>
          <label>
            <span>Nomor resi</span>
            <input name="trackingNumber" required maxLength={100} inputMode="numeric" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </label>
        </div>
        <ErrorText error={shipState?.error} />
        <button className="submit-btn" type="submit" disabled={shipPending}>
          {shipPending ? "Menyimpan…" : "Tandai terkirim"}
        </button>
      </form>
    );
  }

  if (status === "SHIPPED") {
    return (
      <form action={completeAction} className="admin-request-form">
        <input type="hidden" name="id" value={id} />
        <ErrorText error={completeState?.error} />
        <button className="submit-btn" type="submit" disabled={completePending}>
          {completePending ? "Menyimpan…" : "Tandai selesai"}
        </button>
      </form>
    );
  }

  return null;
}
