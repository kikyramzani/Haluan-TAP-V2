"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import type { Platform, CommissionType } from "@prisma/client";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { brandSlug } from "../../../../lib/brand-key";
import { notifyNewCampaign } from "../../../../lib/notifications";
import { CAMPAIGN_CATALOG_TAG } from "../../../../lib/catalog-db";
import { recomputeBrandPlatformStat } from "./stats";

function revalidateCampaignSurfaces(id?: string) {
  revalidatePath("/admin/campaign");
  if (id) revalidatePath(`/admin/campaign/${id}`);
  revalidatePath("/admin/campaign/produk");
  revalidatePath("/admin/campaign/link");
  /**
   * Sampai sekarang hanya halaman /admin yang disegarkan, sementara katalog
   * publik di-cache 300 detik (lib/catalog-db.ts) tanpa ada yang pernah
   * membatalkannya — status, kuota, hasSample, dan komisi tier yang baru
   * disimpan admin butuh sampai lima menit untuk terlihat creator.
   *
   * updateTag, bukan revalidateTag(tag, "max"): profil "max" tetap menyajikan
   * data basi sambil menyegarkan di latar, jadi admin yang langsung memeriksa
   * hasil suntingannya akan melihat angka lama. Hanya sah dari Server Action —
   * di dalam route handler (cron) ia melempar, dan di sana "max" justru pas
   * karena tidak ada yang menunggu.
   */
  updateTag(CAMPAIGN_CATALOG_TAG);
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

  /**
   * Kuota dan hasSample adalah dua kolom yang berdiri sendiri: kuota adalah
   * KAPASITAS, hasSample adalah KEBIJAKAN ("brand ini membuka sample"). Sampai
   * sekarang tidak ada satu pun permukaan admin yang menulis hasSample — hanya
   * skrip migrasi sekali jalan dan semaian e2e — sehingga mengisi kuota 100
   * tidak mengubah apa pun: katalog tetap membaca hasSample dan menampilkan
   * "Belum tersedia", dan checkSampleGate menolak requestnya sebagai
   * CAMPAIGN_INACTIVE, bukan NO_QUOTA.
   *
   * Tiga nilai, bukan checkbox: kolomnya Boolean? dan checkbox yang tidak
   * dicentang TIDAK terkirim di FormData — tidak terbedakan dari "belum
   * ditentukan". Satu penyimpanan biasa akan menulis false ke ratusan campaign
   * yang masih null, dan ubin publiknya berubah dari disembunyikan jadi
   * mengumumkan "Belum tersedia".
   */
  const hasSampleRaw = String(formData.get("hasSample") ?? "");
  const hasSample = hasSampleRaw === "yes" ? true : hasSampleRaw === "no" ? false : null;

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
    data: { status, sampleQuota, sampleQuotaRemaining, hasSample, brief, creatorRequirements, displayOrderWeight, newSku, specialLivePrice, validUntil },
  });

  await recordAudit({
    actorId: admin.id,
    action: "campaign.update",
    targetId: id,
    before: {
      status: before.status,
      sampleQuota: before.sampleQuota,
      sampleQuotaRemaining: before.sampleQuotaRemaining,
      hasSample: before.hasSample,
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
      hasSample: updated.hasSample,
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
  /**
   * Batas 0–100 diperiksa DI SINI, bukan hanya di input.
   *
   * Field komisinya memang punya min="0" max="100", tetapi editor tier bukan
   * &lt;form&gt; dan tombol simpannya type="button" — tidak pernah ada event submit,
   * jadi validasi bawaan peramban tidak pernah jalan. Sebelum ini yang diperiksa
   * hanya Number.isFinite, sehingga mengetik 500 atau -5 tersimpan apa adanya
   * dan tayang ke creator sebagai "500%" di kartu brand dan halaman deal.
   *
   * Ambangnya disamakan dengan jalur impor CSV (MIN_RATE/MAX_RATE di
   * lib/commission.ts), supaya satu campaign tidak bisa punya dua aturan
   * tergantung lewat mana ia dimasukkan.
   */
  const invalid = cleaned.find((row) => {
    if (!isPersentase || !row.commission) return false;
    const value = Number(row.commission.replace(",", "."));
    return !Number.isFinite(value) || value <= 0 || value > 100;
  });
  if (invalid) {
    return { error: `Komisi "${invalid.commission}" tidak masuk akal. Isi angka di atas 0 sampai 100.` };
  }

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
