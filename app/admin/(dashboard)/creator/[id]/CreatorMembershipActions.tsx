"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConfirmButton from "../../ConfirmButton";
import { verifyCreator, rejectCreator, suspendCreator, restoreCreatorToPending } from "../actions";

type Membership = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

export default function CreatorMembershipActions({ creatorId, membership }: { creatorId: string; membership: Membership }) {
  const router = useRouter();
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyCreator, null);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectCreator, null);
  const [suspendState, suspendAction, suspendPending] = useActionState(suspendCreator, null);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreCreatorToPending, null);

  useEffect(() => {
    if (
      (verifyState && "success" in verifyState) ||
      (rejectState && "success" in rejectState) ||
      (suspendState && "success" in suspendState) ||
      (restoreState && "success" in restoreState)
    ) {
      router.refresh();
    }
  }, [verifyState, rejectState, suspendState, restoreState, router]);

  const canVerify = membership !== "VERIFIED";
  const canReject = membership !== "REJECTED";
  const canSuspend = membership === "VERIFIED";
  const canRestore = membership === "REJECTED" || membership === "SUSPENDED";

  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <span>MEMBERSHIP</span>
          <h2>Kelola status kreator</h2>
        </div>
      </div>

      <div className="two-col">
        {canVerify ? (
          <form action={verifyAction}>
            <input type="hidden" name="id" value={creatorId} />
            <button className="submit-btn" type="submit" disabled={verifyPending}>
              {verifyPending ? "Memverifikasi…" : "Verifikasi"}
            </button>
            {verifyState && "error" in verifyState ? (
              <p className="form-error" role="alert">
                {verifyState.error}
              </p>
            ) : null}
          </form>
        ) : null}

        {canSuspend ? (
          <form action={suspendAction}>
            <input type="hidden" name="id" value={creatorId} />
            {/* Menangguhkan mencabut akses kreator ke seluruh katalog seketika.
                Pemulihannya manual, lewat "Kembalikan ke Pending". */}
            <ConfirmButton className="submit-btn danger" confirmLabel="Ya, tangguhkan" pendingLabel="Menangguhkan…" pending={suspendPending}>
              Suspend
            </ConfirmButton>
            {suspendState && "error" in suspendState ? (
              <p className="form-error" role="alert">
                {suspendState.error}
              </p>
            ) : null}
          </form>
        ) : null}

        {canRestore ? (
          <form action={restoreAction}>
            <input type="hidden" name="id" value={creatorId} />
            <button className="submit-btn" type="submit" disabled={restorePending}>
              {restorePending ? "Mengembalikan…" : "Kembalikan ke Pending"}
            </button>
            {restoreState && "error" in restoreState ? (
              <p className="form-error" role="alert">
                {restoreState.error}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>

      {canReject ? (
        <form action={rejectAction} className="admin-request-form">
          <input type="hidden" name="id" value={creatorId} />
          <label>
            <span>Alasan penolakan</span>
            <textarea name="reason" required rows={3} placeholder="Wajib diisi" />
          </label>
          {rejectState && "error" in rejectState ? (
            <p className="form-error" role="alert">
              {rejectState.error}
            </p>
          ) : null}
          <button className="submit-btn" type="submit" disabled={rejectPending}>
            {rejectPending ? "Menolak…" : "Tolak / Reject"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
