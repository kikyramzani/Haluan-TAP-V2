"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { promoteToSuperAdmin, demoteToCreator } from "./actions";

export default function RoleControls({ userId, role }: { userId: string; role: "ADMIN" | "SUPER_ADMIN" }) {
  const router = useRouter();
  const [promoteState, promoteAction, promotePending] = useActionState(promoteToSuperAdmin, null);
  const [demoteState, demoteAction, demotePending] = useActionState(demoteToCreator, null);

  useEffect(() => {
    const promoted = Boolean(promoteState && "success" in promoteState && promoteState.success);
    const demoted = Boolean(demoteState && "success" in demoteState && demoteState.success);
    if (promoted || demoted) router.refresh();
  }, [promoteState, demoteState, router]);

  if (role === "SUPER_ADMIN") {
    return (
      <form action={demoteAction} className="table-actions">
        <button type="submit" className="danger" disabled={demotePending}>
          {demotePending ? "Memproses…" : "Turunkan ke Creator"}
        </button>
        <input type="hidden" name="userId" value={userId} />
        {demoteState && "error" in demoteState ? (
          <span className="form-error" role="alert">
            {demoteState.error}
          </span>
        ) : null}
      </form>
    );
  }

  return (
    <form action={promoteAction} className="table-actions">
      <button type="submit" disabled={promotePending}>
        {promotePending ? "Memproses…" : "Jadikan Super Admin"}
      </button>
      <input type="hidden" name="userId" value={userId} />
      {promoteState && "error" in promoteState ? (
        <span className="form-error" role="alert">
          {promoteState.error}
        </span>
      ) : null}
    </form>
  );
}
