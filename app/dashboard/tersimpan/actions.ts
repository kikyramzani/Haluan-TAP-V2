"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";

/**
 * Bookmarking is per-campaign, not per-brand (`SavedCampaign` is keyed on
 * `[creatorId, campaignId]` — see prisma/schema.prisma). One toggle covers
 * both call sites: the star on the public /deal/[slug] page and the
 * "Hapus dari tersimpan" control on /dashboard/tersimpan itself.
 *
 * `campaignId` here is always the real Prisma `Campaign.id` (the FK
 * `SavedCampaign` points at), never the `slug` used in the URL — callers
 * resolve the slug -> id themselves before invoking this.
 */
export async function toggleSavedCampaign(campaignId: string): Promise<{ saved: boolean } | { error: string }> {
  const user = await requireUser("/dashboard/tersimpan");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { userId: user.id } });

  const existing = await prisma.savedCampaign.findUnique({
    where: { creatorId_campaignId: { creatorId: creator.id, campaignId } },
  });

  if (existing) {
    await prisma.savedCampaign.delete({ where: { id: existing.id } });
    revalidatePath("/dashboard/tersimpan");
    return { saved: false };
  }

  try {
    await prisma.savedCampaign.create({ data: { creatorId: creator.id, campaignId } });
  } catch {
    // Campaign was removed/hidden between render and click, or a
    // double-click raced past the findUnique above.
    return { error: "Campaign tidak ditemukan." };
  }
  revalidatePath("/dashboard/tersimpan");
  return { saved: true };
}
