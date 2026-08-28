"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { cancelOwnSampleRequest } from "../../../lib/requests";

export type CancelSampleState = { error: string } | { success: true } | null;

/**
 * Wraps lib/requests.ts's cancelOwnSampleRequest, which already implements
 * the race-safe "creator boleh membatalkan sendiri selama masih PENDING"
 * check (re-reads status inside the same transaction an admin's approval
 * would use) — this action only resolves the caller's creatorId and turns
 * the two typed failure modes into a message for the form.
 */
export async function cancelSampleRequest(_prevState: CancelSampleState, formData: FormData): Promise<CancelSampleState> {
  const user = await requireUser("/dashboard/sample");
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "Request tidak ditemukan." };

  const creator = await prisma.creator.findUnique({ where: { userId: user.id } });
  if (!creator) return { error: "Profil creator tidak ditemukan." };

  try {
    await cancelOwnSampleRequest(creator.id, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_STATUS_TRANSITION") {
      return { error: "Request ini sudah diproses tim Haluan, tidak bisa dibatalkan lagi." };
    }
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return { error: "Request tidak ditemukan." };
    }
    return { error: "Gagal membatalkan request. Coba lagi." };
  }

  revalidatePath("/dashboard/sample");
  return { success: true };
}
