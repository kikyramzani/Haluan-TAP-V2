"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";

/**
 * Marks a single notification read. Scoped to `id` AND `userId` together —
 * never `id` alone — so a creator can never mark another creator's
 * notification as read via a guessed id.
 */
export async function markNotificationRead(id: string) {
  const user = await requireUser("/dashboard/notifikasi");
  if (!id) return { error: "Notifikasi tidak ditemukan." };

  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifikasi");
  return { success: true };
}

/** Marks every unread notification belonging to the acting user as read. */
export async function markAllNotificationsRead() {
  const user = await requireUser("/dashboard/notifikasi");

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/notifikasi");
  return { success: true };
}
