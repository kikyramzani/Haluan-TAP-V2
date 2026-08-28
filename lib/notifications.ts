import { prisma } from "./db.ts";
import { SAMPLE_STATUS_LABEL } from "./sample-status.ts";
import type { NotificationType, Prisma } from "@prisma/client";

/**
 * Every notification here is targeted at a specific, computed audience — never
 * a broadcast to all creators. Each function below is its own targeting rule;
 * see the doc's "notifikasi" section for why (a new campaign only reaches
 * creators whose category matches, not everyone).
 */
type NewNotification = { type: NotificationType; title: string; body: string; payload?: Record<string, unknown> };

async function fanOut(userIds: readonly string[], notif: NewNotification): Promise<number> {
  const uniqueIds = Array.from(new Set(userIds));
  if (!uniqueIds.length) return 0;
  const result = await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, type: notif.type, title: notif.title, body: notif.body, payload: notif.payload as Prisma.InputJsonValue | undefined })),
  });
  return result.count;
}

export async function notifySampleStatusChanged(sampleRequestId: string): Promise<void> {
  const request = await prisma.sampleRequest.findUnique({
    where: { id: sampleRequestId },
    select: { status: true, brandNameSnapshot: true, creator: { select: { userId: true } } },
  });
  if (!request) return;
  const label = SAMPLE_STATUS_LABEL[request.status];
  await fanOut([request.creator.userId], {
    type: "SAMPLE_STATUS_CHANGED",
    title: `Status sample ${request.brandNameSnapshot} berubah`,
    body: `Request sample kamu untuk ${request.brandNameSnapshot} sekarang berstatus "${label}".`,
    payload: { sampleRequestId, status: request.status },
  });
}

/** Admin-facing: a new request needs review. Targets every Admin/Super Admin, since PIC assignment (Creator.assignedPic) is free text, not a User relation. */
export async function notifyNewSampleRequest(sampleRequestId: string): Promise<void> {
  const request = await prisma.sampleRequest.findUnique({
    where: { id: sampleRequestId },
    select: { brandNameSnapshot: true, creator: { select: { user: { select: { name: true } } } } },
  });
  if (!request) return;
  const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
  await fanOut(admins.map((admin) => admin.id), {
    type: "SAMPLE_REQUEST_NEW",
    title: "Sample request baru",
    body: `${request.creator.user.name} mengajukan sample untuk ${request.brandNameSnapshot}.`,
    payload: { sampleRequestId },
  });
}

export async function notifyProfileVerified(userId: string): Promise<void> {
  await fanOut([userId], {
    type: "PROFILE_VERIFIED",
    title: "Akun kamu terverifikasi",
    body: "Profil MCN kamu sudah diverifikasi. Kamu sekarang bisa mengajukan sample.",
  });
}

export async function notifyProfileRejected(userId: string, reason: string): Promise<void> {
  await fanOut([userId], {
    type: "PROFILE_REJECTED",
    title: "Verifikasi profil perlu diperbaiki",
    body: reason ? `Verifikasi profil kamu ditolak: ${reason}` : "Verifikasi profil kamu ditolak. Silakan perbarui data dan coba lagi.",
    payload: { reason },
  });
}

/** Targets VERIFIED creators whose content category matches the campaign's brand category. Skipped entirely if the brand has no category — there's nothing to match against. */
export async function notifyNewCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { slug: true, brand: { select: { displayName: true, categoryId: true } } },
  });
  if (!campaign || !campaign.brand.categoryId) return;

  const creators = await prisma.creator.findMany({
    where: { membership: "VERIFIED", categories: { some: { categoryId: campaign.brand.categoryId } } },
    select: { userId: true },
  });
  await fanOut(creators.map((creator) => creator.userId), {
    type: "CAMPAIGN_NEW",
    title: `Campaign baru: ${campaign.brand.displayName}`,
    body: `Ada campaign baru dari ${campaign.brand.displayName} yang cocok dengan kategori kontenmu.`,
    payload: { campaignId, slug: campaign.slug },
  });
}

/** Targets VERIFIED creators who saved or previously clicked this campaign — not a blast to everyone. Marks the campaign notified so the nightly cron doesn't repeat this every night. */
export async function notifyCampaignEndingSoon(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { slug: true, validUntil: true, brand: { select: { displayName: true } } },
  });
  if (!campaign) return;

  const [savers, clickers] = await Promise.all([
    prisma.savedCampaign.findMany({ where: { campaignId, creator: { membership: "VERIFIED" } }, select: { creator: { select: { userId: true } } } }),
    prisma.linkClick.findMany({
      where: { campaignId, creatorId: { not: null }, creator: { membership: "VERIFIED" } },
      distinct: ["creatorId"],
      select: { creator: { select: { userId: true } } },
    }),
  ]);
  const userIds = [...savers, ...clickers].map((row) => row.creator?.userId).filter((id): id is string => Boolean(id));

  await fanOut(userIds, {
    type: "CAMPAIGN_ENDING_SOON",
    title: `${campaign.brand.displayName} akan segera berakhir`,
    body: `Campaign ${campaign.brand.displayName} yang kamu simpan/klik akan berakhir pada ${campaign.validUntil?.toLocaleDateString("id-ID") ?? "waktu dekat"}.`,
    payload: { campaignId, slug: campaign.slug },
  });

  await prisma.campaign.update({ where: { id: campaignId }, data: { endingSoonNotifiedAt: new Date() } });
}
