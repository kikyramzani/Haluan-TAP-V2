"use client";

import { useActionState } from "react";
import { cancelSampleRequest, type CancelSampleState } from "./actions";

export default function CancelSampleForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<CancelSampleState, FormData>(cancelSampleRequest, null);
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="sample-cancel-form">
      <input type="hidden" name="requestId" value={requestId} />
      <button className="btn btn-ghost" type="submit" disabled={pending}>
        {pending ? "Membatalkan…" : "Batalkan request"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
