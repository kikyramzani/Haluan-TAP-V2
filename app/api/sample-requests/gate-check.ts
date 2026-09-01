import { prisma } from "../../../lib/db";
import { computeProfileCompleteness } from "../../../lib/profile-completeness";
import { checkSampleGate, type SampleGateResult } from "../../../lib/sample-gate";
import { resolveCampaignId } from "../../../lib/requests";
import type { TapUser } from "../../../lib/models";

/**
 * Shared by the creator-facing POST /api/sample-requests (submit-time gate,
 * source of truth) and GET /api/sample-requests/gate (proactive pre-check
 * shown once a campaign is selected on /request-sample). Both need the same
 * five gate inputs gathered from Prisma before handing off to the pure
 * checkSampleGate(). Kept in one place so the two call sites can't drift.
 *
 * A rejected or cancelled prior request must NOT block a new attempt. Only
 * an active/completed one does (see the "notIn" below).
 */
export async function evaluateSampleGate(user: TapUser, brand: string, platform: string): Promise<{ result: SampleGateResult; campaignId: string | null }> {
  const creator = await prisma.creator.findUnique({ where: { userId: user.id }, include: { address: true } });
  if (!creator) return { result: { allowed: false, reason: "PROFILE_INCOMPLETE" }, campaignId: null };

  const campaignId = await resolveCampaignId(brand, platform);
  const campaign = campaignId ? await prisma.campaign.findUnique({ where: { id: campaignId } }) : null;
  const alreadyRequestedCount = campaignId
    ? await prisma.sampleRequest.count({ where: { creatorId: creator.id, campaignId, status: { notIn: ["REJECTED", "CANCELLED"] } } })
    : 0;

  const completeness = computeProfileCompleteness({
    name: user.name,
    phone: user.phone,
    provinceId: creator.address?.provinceId,
    regencyId: creator.address?.regencyId,
    districtId: creator.address?.districtId,
    villageId: creator.address?.villageId,
    detailAddress: creator.address?.detailAddress,
    postalCode: creator.address?.postalCode,
    recipientPhone: creator.address?.recipientPhone,
  });

  const result = checkSampleGate({
    profileComplete: completeness.complete,
    membership: user.membership === "verified" ? "VERIFIED" : user.membership === "rejected" ? "REJECTED" : user.membership === "suspended" ? "SUSPENDED" : "PENDING",
    campaignStatus: campaign?.status ?? null,
    campaignHasSample: campaign?.hasSample ?? null,
    sampleQuotaRemaining: campaign?.sampleQuotaRemaining ?? null,
    alreadyRequested: alreadyRequestedCount > 0,
  });

  return { result, campaignId };
}
