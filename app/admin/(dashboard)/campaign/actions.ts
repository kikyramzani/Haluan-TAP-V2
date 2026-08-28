"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Platform, CommissionType } from "@prisma/client";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { brandSlug } from "../../../../lib/brand-key";
import { notifyNewCampaign } from "../../../../lib/notifications";
import { recomputeBrandPlatformStat } from "./stats";

function revalidateCampaignSurfaces(id?: string) {
  revalidatePath("/admin/campaign");
  if (id) revalidatePath(`/admin/campaign/${id}`);
  revalidatePath("/admin/produk");
  revalidatePath("/admin/link");
}

export async function createCampaign(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "").trim();
  const platform: Platform = formData.get("platform") === "SHOPEE_AFFILIATE" ? "SHOPEE_AFFILIATE" : "TIKTOK_SHOP";
  const commissionType: CommissionType = formData.get("commissionType") === "KETENTUAN_PLATFORM" ? "KETENTUAN_PLATFORM" : "PERSENTASE";
  if (!brandId) return { error: "Pilih brand terlebih dahulu." };

  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return { error: "Brand tidak ditemukan." };

  const duplicate = await prisma.campaign.findFirst({ where: { brandId, platform } });
  if (duplicate) return { error: "Brand ini sudah punya campaign di platform tersebut." };

  const baseSlug = platform === "SHOPEE_AFFILIATE" ? `shopee-${brandSlug(brand.displayName)}` : brandSlug(brand.displayName);
  let slug = baseSlug || `campaign-${brandId.slice(0, 8)}`;
  let suffix = 2;
  while (await prisma.campaign.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const campaign = await prisma.campaign.create({ data: { brandId, platform, commissionType, slug, status: "ACTIVE" } });
  await recomputeBrandPlatformStat(brandId, platform);
  await recordAudit({ actorId: admin.id, action: "campaign.create", targetId: campaign.id, after: { brandId, platform, commissionType, slug } });
  // Best-effort: the campaign itself already exists and must not be undone by a notification failure.
  try { await notifyNewCampaign(campaign.id); } catch { /* noted, not fatal */ }
  revalidateCampaignSurfaces(campaign.id);
  redirect(`/admin/campaign/${campaign.id}`);
}

export async function updateCampaignAction(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Campaign tidak valid." };

  const before = await prisma.campaign.findUnique({ where: { id } });
  if (!before) return { error: "Campaign tidak ditemukan." };

  const statusRaw = formData.get("status");
  const status = statusRaw === "ENDED" ? "ENDED" : statusRaw === "HIDDEN" ? "HIDDEN" : "ACTIVE";

  const quotaRaw = String(formData.get("sampleQuota") ?? "").trim();
  let sampleQuota: number | null = null;
  if (quotaRaw !== "") {
    sampleQuota = Number.parseInt(quotaRaw, 10);
    if (!Number.isFinite(sampleQuota) || sampleQuota < 0) return { error: "Kuota sample harus berupa angka 0 atau lebih." };
  }

  // Bumping rule: a first-time quota initializes remaining to the same value;
  // an increase carries the delta forward; clearing the quota entirely also
  // clears remaining; a decrease leaves remaining untouched rather than
  // guessing how much of an already-claimed quota should be taken back.
  let sampleQuotaRemaining = before.sampleQuotaRemaining;
  if (sampleQuota === null) {
    sampleQuotaRemaining = null;
  } else if (before.sampleQuota === null) {
    sampleQuotaRemaining = sampleQuota;
  } else if (sampleQuota > before.sampleQuota) {
    sampleQuotaRemaining = (before.sampleQuotaRemaining ?? 0) + (sampleQuota - before.sampleQuota);
  }

  const brief = String(formData.get("brief") ?? "").trim() || null;
  const creatorRequirements = String(formData.get("creatorRequirements") ?? "").trim() || null;
  const displayOrderWeightRaw = String(formData.get("displayOrderWeight") ?? "0").trim();
  const displayOrderWeightParsed = Number.parseInt(displayOrderWeightRaw, 10);
  const displayOrderWeight = Number.isFinite(displayOrderWeightParsed) ? displayOrderWeightParsed : 0;
  const newSku = formData.get("newSku") === "on";
  const specialLivePrice = formData.get("specialLivePrice") === "on";
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();
  const validUntil = validUntilRaw ? new Date(`${validUntilRaw}T00:00:00.000Z`) : null;

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status, sampleQuota, sampleQuotaRemaining, brief, creatorRequirements, displayOrderWeight, newSku, specialLivePrice, validUntil },
  });

  await recordAudit({
    actorId: admin.id,
    action: "campaign.update",
    targetId: id,
    before: {
      status: before.status,
      sampleQuota: before.sampleQuota,
      sampleQuotaRemaining: before.sampleQuotaRemaining,
      brief: before.brief,
      creatorRequirements: before.creatorRequirements,
      displayOrderWeight: before.displayOrderWeight,
      newSku: before.newSku,
      specialLivePrice: before.specialLivePrice,
      validUntil: before.validUntil?.toISOString() ?? null,
    },
    after: {
      status: updated.status,
      sampleQuota: updated.sampleQuota,
      sampleQuotaRemaining: updated.sampleQuotaRemaining,
      brief: updated.brief,
      creatorRequirements: updated.creatorRequirements,
      displayOrderWeight: updated.displayOrderWeight,
      newSku: updated.newSku,
      specialLivePrice: updated.specialLivePrice,
      validUntil: updated.validUntil?.toISOString() ?? null,
    },
  });

  // A campaign coming back from HIDDEN/ENDED to ACTIVE is "new" to creators again.
  if (before.status !== "ACTIVE" && updated.status === "ACTIVE") {
    try { await notifyNewCampaign(id); } catch { /* noted, not fatal */ }
  }

  revalidateCampaignSurfaces(id);
  return { success: true };
}

export type TierRowInput = { tierId?: string; linkId?: string; label: string; commission: string; url: string };

export async function saveCampaignTiers(campaignId: string, rows: TierRowInput[]) {
  const admin = await requireAdmin();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { error: "Campaign tidak ditemukan." };

  const cleaned = rows
    .map((row) => ({ ...row, label: row.label.trim(), url: row.url.trim(), commission: row.commission.trim() }))
    .filter((row) => row.label || row.url || row.commission);

  if (!cleaned.length) return { error: "Minimal satu tier diperlukan." };
  if (cleaned.some((row) => !row.url)) return { error: "Setiap tier butuh link." };

  const isPersentase = campaign.commissionType === "PERSENTASE";

  // Defense in depth: KETENTUAN_PLATFORM campaigns never persist a commission
  // number even if the client somehow submitted one; PERSENTASE campaigns
  // must keep at least one tier with a real commission value.
  const commissions: (number | null)[] = cleaned.map((row) => {
    if (!isPersentase) return null;
    if (!row.commission) return null;
    const value = Number(row.commission.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  });

  if (isPersentase && !commissions.some((value) => value !== null)) {
    return { error: "Campaign dengan tipe Persentase butuh minimal satu tier dengan nilai komisi." };
  }

  const beforeTiers = await prisma.campaignTier.findMany({ where: { campaignId } });
  const beforeLinks = await prisma.campaignLink.findMany({ where: { campaignId } });

  const keepTierIds = cleaned.map((row) => row.tierId).filter((value): value is string => Boolean(value));
  const keepLinkIds = cleaned.map((row) => row.linkId).filter((value): value is string => Boolean(value));

  await prisma.$transaction(async (tx) => {
    await tx.campaignTier.deleteMany({ where: { campaignId, id: { notIn: keepTierIds } } });
    await tx.campaignLink.deleteMany({ where: { campaignId, id: { notIn: keepLinkIds } } });

    for (let index = 0; index < cleaned.length; index += 1) {
      const row = cleaned[index];
      const commission = commissions[index];

      if (row.tierId) {
        await tx.campaignTier.update({ where: { id: row.tierId }, data: { label: row.label || null, commission, sortIndex: index } });
      } else {
        await tx.campaignTier.create({ data: { campaignId, label: row.label || null, commission, sortIndex: index } });
      }

      if (row.linkId) {
        await tx.campaignLink.update({ where: { id: row.linkId }, data: { url: row.url, isPrimary: index === 0, sortIndex: index } });
      } else {
        await tx.campaignLink.create({ data: { campaignId, url: row.url, isPrimary: index === 0, sortIndex: index } });
      }
    }
  });

  await recomputeBrandPlatformStat(campaign.brandId, campaign.platform);

  await recordAudit({
    actorId: admin.id,
    action: "campaign.tiers_update",
    targetId: campaignId,
    before: { tiers: beforeTiers.map((tier) => ({ id: tier.id, label: tier.label, commission: tier.commission?.toString() ?? null })), links: beforeLinks.map((link) => ({ id: link.id, url: link.url, isPrimary: link.isPrimary })) },
    after: { rows: cleaned.map((row, index) => ({ label: row.label, commission: commissions[index], url: row.url, isPrimary: index === 0 })) },
  });

  revalidateCampaignSurfaces(campaignId);
  return { success: true };
}
