import { prisma } from "./db.ts";
import { brandKey } from "./brand-key.ts";
import { SAMPLE_STATUS_TRANSITIONS } from "./sample-status.ts";
import { notifyNewSampleRequest } from "./notifications.ts";
import type { Prisma, $Enums } from "@prisma/client";

type SampleRequestStatus = $Enums.SampleRequestStatus;

/**
 * Sample requests on Postgres. No data was migrated here (per the 2026-08-27
 * decision, see the rebuild plan's progress log), so this starts empty. The
 * shape below is a deliberate bridge, not the target design: `campaignId` is
 * resolved from the free-text brand/platform the current /request-sample
 * form still submits, and several fields (username, profileUrl, commitment,
 * sow, picName/picPhone, recipientName/recipientPhone) exist only to keep
 * that form and the admin batch-create working. Phase 5 replaces the form
 * with real campaign selection and profile-sourced address/contact info,
 * at which point those fields stop being written by new code.
 */

// user: only a safe subset. Never the full User row (passwordHash etc.).
// This whole object is returned as an API response body (creator-facing
// POST, admin GET/PATCH), so anything included here is public to whoever
// can call those routes.
const requestInclude = {
  creator: { include: { user: { select: { id: true, name: true, email: true } } } },
  campaign: { include: { brand: true } },
} satisfies Prisma.SampleRequestInclude;
type RequestRecord = Prisma.SampleRequestGetPayload<{ include: typeof requestInclude }>;

/** Exported for the request-sample gate check (lib/sample-gate.ts's caller needs the same brand+platform → Campaign resolution used at creation time). */
export async function resolveCampaignId(brand: string, platform: string): Promise<string | null> {
  if (platform === "Instagram") return null;
  const brandRow = await prisma.brand.findUnique({ where: { brandKey: brandKey(brand) } });
  if (!brandRow) return null;
  const campaign = await prisma.campaign.findFirst({
    where: { brandId: brandRow.id, platform: platform === "Shopee" ? "SHOPEE_AFFILIATE" : "TIKTOK_SHOP" },
  });
  return campaign?.id ?? null;
}

export async function createSampleRequest(input: {
  userId: string;
  brand: string;
  platform: string;
  username?: string;
  profileUrl?: string;
  recipientName?: string;
  phone?: string;
  address?: string;
  commitment: boolean;
  sow?: string;
  preferredSample?: string;
  picName?: string;
  picPhone?: string;
}) {
  const creator = await prisma.creator.findUnique({ where: { userId: input.userId } });
  if (!creator) throw new Error("CREATOR_NOT_FOUND");
  const campaignId = await resolveCampaignId(input.brand, input.platform);
  const created = await prisma.sampleRequest.create({
    data: {
      creatorId: creator.id,
      campaignId,
      brandNameSnapshot: input.brand,
      username: input.username,
      profileUrl: input.profileUrl,
      recipientName: input.recipientName,
      recipientPhone: input.phone,
      legacyAddressText: input.address,
      commitment: input.commitment,
      sow: input.sow,
      preferredSample: input.preferredSample,
      picName: input.picName,
      picPhone: input.picPhone,
    },
    include: requestInclude,
  });
  // Best-effort: the request itself already succeeded and must not be undone by a notification failure.
  try { await notifyNewSampleRequest(created.id); } catch { /* noted, not fatal */ }
  return created;
}

export async function createSampleRequests(inputs: Parameters<typeof createSampleRequest>[0][]) {
  const created = [];
  for (const input of inputs) created.push(await createSampleRequest(input));
  return created;
}

export async function listUserSampleRequests(userId: string, limit = 50): Promise<RequestRecord[]> {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) return [];
  return prisma.sampleRequest.findMany({
    where: { creatorId: creator.id },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listSampleRequests(input: { offset?: number; limit?: number; q?: string; status?: string; pic?: string; year?: string } = {}) {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = (input.q ?? "").trim();
  const where: Prisma.SampleRequestWhereInput = {
    ...(input.status ? { status: input.status as SampleRequestStatus } : {}),
    ...(input.pic ? { picName: input.pic } : {}),
    ...(input.year ? { createdAt: { gte: new Date(`${input.year}-01-01`), lt: new Date(`${Number(input.year) + 1}-01-01`) } } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { brandNameSnapshot: { contains: q, mode: "insensitive" } },
            { username: { contains: q, mode: "insensitive" } },
            { picName: { contains: q, mode: "insensitive" } },
            { trackingNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.sampleRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    prisma.sampleRequest.count({ where }),
  ]);
  return { items, total };
}

export async function updateSampleRequest(id: string, input: { status: SampleRequestStatus; trackingNumber?: string; carrier?: string; rejectionReason?: string; approveNote?: string; picName?: string; picPhone?: string }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.sampleRequest.findUnique({ where: { id }, include: { creator: { include: { address: true } } } });
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.status !== input.status && !SAMPLE_STATUS_TRANSITIONS[request.status].includes(input.status)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    // Approval is the sample-quota race: the conditional decrement only
    // succeeds if a slot is still free, and snapshots the creator's current
    // address so a later profile edit can't retroactively change a shipment
    // already promised. Campaigns migrated from the sheets all have
    // sampleQuotaRemaining = null (no quota data existed in the sheets), so
    // the check is skipped for those. Only campaigns an admin has since
    // given a real quota to are actually guarded.
    if (input.status === "APPROVED" && request.campaignId) {
      const campaign = await tx.campaign.findUnique({ where: { id: request.campaignId } });
      if (campaign?.sampleQuotaRemaining !== null && campaign?.sampleQuotaRemaining !== undefined) {
        const decremented = await tx.campaign.updateMany({
          where: { id: request.campaignId, sampleQuotaRemaining: { gt: 0 } },
          data: { sampleQuotaRemaining: { decrement: 1 } },
        });
        if (decremented.count === 0) throw new Error("NO_QUOTA");
      }
    }

    const now = new Date();
    const data: Prisma.SampleRequestUpdateInput = {
      status: input.status,
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.rejectionReason !== undefined ? { rejectionReason: input.rejectionReason } : {}),
      ...(input.approveNote !== undefined ? { approveNote: input.approveNote } : {}),
      ...(input.picName !== undefined ? { picName: input.picName } : {}),
      ...(input.picPhone !== undefined ? { picPhone: input.picPhone } : {}),
      ...(input.status === "APPROVED" ? { approvedAt: now, addressSnapshot: request.creator.address ? JSON.parse(JSON.stringify(request.creator.address)) : undefined } : {}),
      ...(input.status === "SHIPPED" ? { shippedAt: now } : {}),
      ...(input.status === "COMPLETED" ? { completedAt: now } : {}),
      ...(input.status === "CANCELLED" ? { cancelledAt: now } : {}),
    };

    return tx.sampleRequest.update({ where: { id }, data, include: requestInclude });
  });
}

/**
 * Creator-initiated cancel (doc: "creator boleh membatalkan sendiri selama
 * masih PENDING"). Ownership is checked before `updateSampleRequest` runs,
 * that function's own re-read-inside-the-transaction is what makes this
 * race-safe against a concurrent admin approval, exactly like an admin
 * status update, just gated to PENDING→CANCELLED and to the requester's
 * own rows.
 */
export async function cancelOwnSampleRequest(creatorId: string, requestId: string) {
  const request = await prisma.sampleRequest.findUnique({ where: { id: requestId }, select: { creatorId: true, status: true } });
  if (!request || request.creatorId !== creatorId) throw new Error("REQUEST_NOT_FOUND");
  if (request.status !== "PENDING") throw new Error("INVALID_STATUS_TRANSITION");
  return updateSampleRequest(requestId, { status: "CANCELLED" });
}
