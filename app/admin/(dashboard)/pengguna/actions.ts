"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";

type ActionState = { error: string } | { success: true } | null;

/**
 * The layout's requireAdmin() already gates /admin/*, but role changes are
 * sensitive enough that the action itself must not trust the page shell,
 * a direct POST to this action from a non-super-admin session must be
 * refused here too, not just hidden from the UI.
 */
async function requireSuperAdmin() {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin?error=forbidden");
  return admin;
}

export async function promoteToSuperAdmin(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const targetId = String(formData.get("userId") ?? "").trim();
  if (!targetId) return { error: "Pengguna tidak ditemukan." };

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  if (target.role === "SUPER_ADMIN") return { error: "Pengguna ini sudah Super Admin." };

  const updated = await prisma.user.update({ where: { id: targetId }, data: { role: "SUPER_ADMIN" } });
  await recordAudit({
    actorId: admin.id,
    action: "user.role_update",
    targetId,
    before: { role: target.role },
    after: { role: updated.role },
  });
  revalidatePath("/admin/pengguna");
  return { success: true };
}

export async function demoteToCreator(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const targetId = String(formData.get("userId") ?? "").trim();
  if (!targetId) return { error: "Pengguna tidak ditemukan." };

  // A Super Admin must not be able to demote their own row. Checked here,
  // not just by omitting the control in the UI, since this action can be
  // invoked directly.
  if (targetId === admin.id) return { error: "Anda tidak dapat menurunkan peran akun Anda sendiri." };

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { error: "Pengguna tidak ditemukan." };
  if (target.role !== "SUPER_ADMIN") return { error: "Hanya Super Admin yang dapat diturunkan dari sini." };

  // Straight to CREATOR is deliberate: if the email is still in ADMIN_EMAILS,
  // reconcileAdminRole() re-promotes to ADMIN on their next request anyway -
  // there is no reliable way (or need) to guess ADMIN vs CREATOR here.
  const updated = await prisma.user.update({ where: { id: targetId }, data: { role: "CREATOR" } });
  await recordAudit({
    actorId: admin.id,
    action: "user.role_update",
    targetId,
    before: { role: target.role },
    after: { role: updated.role },
  });
  revalidatePath("/admin/pengguna");
  return { success: true };
}
