"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { updateSampleRequest } from "../../../../lib/requests";
import { notifySampleStatusChanged } from "../../../../lib/notifications";

type ActionState = { error?: string; success?: boolean } | null;

/**
 * Shared apply+audit path for every stage transition below. Quota guarding
 * and legal-transition checks already live in updateSampleRequest() (see
 * lib/requests.ts) — this only translates its thrown error codes into the
 * same Indonesian messages the old admin route used, so the wording stays
 * consistent across both UIs while AdminClient.tsx is still around.
 */
async function applyStatusUpdate(
  adminId: string,
  id: string,
  input: Parameters<typeof updateSampleRequest>[1],
): Promise<ActionState> {
  const before = await prisma.sampleRequest.findUnique({ where: { id }, select: { status: true } });
  if (!before) return { error: "Request tidak ditemukan." };

  try {
    const updated = await updateSampleRequest(id, input);
    await recordAudit({
      actorId: adminId,
      action: "sample.status_update",
      targetId: id,
      before: { status: before.status },
      after: {
        status: updated.status,
        trackingNumber: updated.trackingNumber ?? undefined,
        carrier: updated.carrier ?? undefined,
        rejectionReason: updated.rejectionReason ?? undefined,
        approveNote: updated.approveNote ?? undefined,
      },
    });
    // Best-effort: a notification failure must not undo an already-applied status change.
    try { await notifySampleStatusChanged(id); } catch { /* noted, not fatal */ }
    revalidatePath("/admin/sample");
    revalidatePath(`/admin/sample/${id}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NO_QUOTA") return { error: "Kuota sample untuk campaign ini sudah habis." };
    if (message === "INVALID_STATUS_TRANSITION") return { error: "Perpindahan status tidak valid." };
    return { error: "Request tidak ditemukan." };
  }
}

export async function approveSampleRequest(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Request tidak ditemukan." };
  const approveNote = String(formData.get("approveNote") ?? "").trim();
  return applyStatusUpdate(admin.id, id, { status: "APPROVED", ...(approveNote ? { approveNote } : {}) });
}

export async function rejectSampleRequest(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  if (!id) return { error: "Request tidak ditemukan." };
  if (!rejectionReason) return { error: "Alasan penolakan wajib diisi." };
  return applyStatusUpdate(admin.id, id, { status: "REJECTED", rejectionReason });
}

export async function markSampleShipped(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const carrier = String(formData.get("carrier") ?? "").trim();
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim();
  if (!id) return { error: "Request tidak ditemukan." };
  if (!carrier || !trackingNumber) return { error: "Kurir dan nomor resi wajib diisi." };
  return applyStatusUpdate(admin.id, id, { status: "SHIPPED", carrier, trackingNumber });
}

export async function markSampleCompleted(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Request tidak ditemukan." };
  return applyStatusUpdate(admin.id, id, { status: "COMPLETED" });
}
