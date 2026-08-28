"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { notifyProfileVerified, notifyProfileRejected } from "../../../../lib/notifications";

type MembershipStatus = Prisma.CreatorGetPayload<object>["membership"];

type ActionResult = { error: string } | { success: true };

async function applyMembershipChange(
  adminId: string,
  id: string,
  next: MembershipStatus,
  allowedFrom: MembershipStatus[],
  extraAuditFields?: Record<string, unknown>,
): Promise<ActionResult> {
  const before = await prisma.creator.findUnique({ where: { id } });
  if (!before) return { error: "Kreator tidak ditemukan." };
  if (!allowedFrom.includes(before.membership)) {
    return { error: "Perubahan status tidak valid dari status kreator saat ini." };
  }

  await prisma.creator.update({ where: { id }, data: { membership: next } });
  await recordAudit({
    actorId: adminId,
    action: "creator.membership_update",
    targetId: id,
    before: { membership: before.membership },
    after: { membership: next, ...extraAuditFields },
  });

  // Best-effort: the membership change itself already succeeded and must not be undone by a notification failure.
  try {
    if (next === "VERIFIED") await notifyProfileVerified(before.userId);
    if (next === "REJECTED") await notifyProfileRejected(before.userId, String(extraAuditFields?.reason ?? ""));
  } catch { /* noted, not fatal */ }

  revalidatePath("/admin/creator");
  revalidatePath(`/admin/creator/${id}`);
  return { success: true };
}

export async function verifyCreator(_prevState: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Kreator tidak valid." };
  return applyMembershipChange(admin.id, id, "VERIFIED", ["PENDING", "REJECTED", "SUSPENDED"]);
}

export async function rejectCreator(_prevState: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { error: "Kreator tidak valid." };
  if (!reason) return { error: "Alasan penolakan wajib diisi." };
  return applyMembershipChange(admin.id, id, "REJECTED", ["PENDING", "VERIFIED", "SUSPENDED"], { reason });
}

export async function suspendCreator(_prevState: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Kreator tidak valid." };
  return applyMembershipChange(admin.id, id, "SUSPENDED", ["VERIFIED"]);
}

export async function restoreCreatorToPending(_prevState: unknown, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Kreator tidak valid." };
  return applyMembershipChange(admin.id, id, "PENDING", ["REJECTED", "SUSPENDED"]);
}

export async function bulkVerifyCreators(ids: string[]): Promise<{ error: string } | { success: true; count: number }> {
  const admin = await requireAdmin();
  if (!ids.length) return { error: "Pilih minimal satu kreator." };

  const result = await prisma.creator.updateMany({
    where: { id: { in: ids }, membership: "PENDING" },
    data: { membership: "VERIFIED" },
  });
  await recordAudit({
    actorId: admin.id,
    action: "creator.bulk_verify",
    targetId: ids.join(","),
    after: { count: result.count },
  });

  revalidatePath("/admin/creator");
  return { success: true, count: result.count };
}
