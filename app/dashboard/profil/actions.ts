"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { cleanText } from "../../../lib/security";
import { computeProfileCompleteness, type ProfileCompleteness } from "../../../lib/profile-completeness";

type ActionState = { error?: string; success?: boolean; completeness?: ProfileCompleteness } | null;

/**
 * Re-derives the completeness percentage from what is actually stored in
 * Postgres after a write, never from the submitted form values — per the
 * doc: "Tiap simpan otomatis menghitung ulang persentase kelengkapan profil
 * dari data yang benar-benar tersimpan di database, bukan dari input form
 * mentah." Shared by all four tab actions below.
 */
async function loadCompleteness(userId: string): Promise<ProfileCompleteness> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { creator: { include: { address: true } } },
  });
  return computeProfileCompleteness({
    name: user.name,
    phone: user.phone,
    provinceId: user.creator?.address?.provinceId,
    regencyId: user.creator?.address?.regencyId,
    districtId: user.creator?.address?.districtId,
    villageId: user.creator?.address?.villageId,
    detailAddress: user.creator?.address?.detailAddress,
    postalCode: user.creator?.address?.postalCode,
    recipientPhone: user.creator?.address?.recipientPhone,
  });
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0/, "62");
}

// ---------------------------------------------------------------------------
// Tab 1: Data Pribadi
// ---------------------------------------------------------------------------

export async function updateDataPribadi(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const name = cleanText(formData.get("name"), 80);
  const phone = normalizePhone(cleanText(formData.get("phone"), 24));
  const nickname = cleanText(formData.get("nickname"), 40) || null;
  const bio = cleanText(formData.get("bio"), 500) || null;

  if (name.length < 2) return { error: "Nama minimal 2 karakter." };
  if (phone.length < 10) return { error: "Nomor WhatsApp tidak valid." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name, phone } }),
    prisma.creator.update({ where: { userId: user.id }, data: { nickname, bio } }),
  ]);

  revalidatePath("/dashboard/profil");
  revalidatePath("/dashboard");
  return { success: true, completeness: await loadCompleteness(user.id) };
}

// ---------------------------------------------------------------------------
// Tab 2: Alamat
// ---------------------------------------------------------------------------

/**
 * Confirms a submitted wilayah chain is internally consistent (village
 * really belongs to that district, which really belongs to that regency,
 * which really belongs to that province) before it is persisted. The
 * client's cascading selects only ever offer valid combinations, but a
 * Server Action must not trust that — this is the same trust boundary as
 * any other public form submission.
 */
async function validateWilayahChain(input: { provinceId: string | null; regencyId: string | null; districtId: string | null; villageId: string | null }) {
  const { provinceId, regencyId, districtId, villageId } = input;
  if (villageId) {
    const village = await prisma.village.findFirst({
      where: {
        id: villageId,
        ...(districtId ? { districtId } : {}),
        ...(regencyId || provinceId ? { district: { ...(regencyId ? { regencyId } : {}), ...(provinceId ? { regency: { provinceId } } : {}) } } : {}),
      },
    });
    if (!village) return "Kombinasi provinsi/kabupaten/kecamatan/kelurahan tidak valid.";
    return null;
  }
  if (districtId) {
    const district = await prisma.district.findFirst({
      where: { id: districtId, ...(regencyId ? { regencyId } : {}), ...(provinceId ? { regency: { provinceId } } : {}) },
    });
    if (!district) return "Kombinasi provinsi/kabupaten/kecamatan tidak valid.";
    return null;
  }
  if (regencyId) {
    const regency = await prisma.regency.findFirst({ where: { id: regencyId, ...(provinceId ? { provinceId } : {}) } });
    if (!regency) return "Kombinasi provinsi/kabupaten tidak valid.";
  }
  return null;
}

export async function updateAlamat(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { userId: user.id }, select: { id: true } });

  const recipientName = cleanText(formData.get("recipientName"), 100) || null;
  const provinceId = cleanText(formData.get("provinceId"), 40) || null;
  const regencyId = cleanText(formData.get("regencyId"), 40) || null;
  const districtId = cleanText(formData.get("districtId"), 40) || null;
  const villageId = cleanText(formData.get("villageId"), 40) || null;
  const detailAddress = cleanText(formData.get("detailAddress"), 500) || null;
  const rt = cleanText(formData.get("rt"), 4) || null;
  const rw = cleanText(formData.get("rw"), 4) || null;
  const postalCodeRaw = cleanText(formData.get("postalCode"), 5);
  const recipientPhone = normalizePhone(cleanText(formData.get("recipientPhone"), 24)) || null;

  if (postalCodeRaw && !/^\d{5}$/.test(postalCodeRaw)) return { error: "Kode pos harus 5 digit angka." };
  if (recipientPhone && recipientPhone.length < 10) return { error: "Nomor penerima paket tidak valid." };

  const chainError = await validateWilayahChain({ provinceId, regencyId, districtId, villageId });
  if (chainError) return { error: chainError };

  await prisma.creatorAddress.upsert({
    where: { creatorId: creator.id },
    create: {
      creatorId: creator.id,
      recipientName,
      provinceId,
      regencyId,
      districtId,
      villageId,
      detailAddress,
      rt,
      rw,
      postalCode: postalCodeRaw || null,
      recipientPhone,
    },
    update: {
      recipientName,
      provinceId,
      regencyId,
      districtId,
      villageId,
      detailAddress,
      rt,
      rw,
      postalCode: postalCodeRaw || null,
      recipientPhone,
    },
  });

  revalidatePath("/dashboard/profil");
  revalidatePath("/dashboard");
  return { success: true, completeness: await loadCompleteness(user.id) };
}

// ---------------------------------------------------------------------------
// Tab 3: Social Media
// ---------------------------------------------------------------------------

function readFollowerCount(formData: FormData, field: string): number | null {
  const raw = formData.get(field);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(Math.min(value, 1_000_000_000));
}

function readUsername(formData: FormData, field: string): string | null {
  return cleanText(formData.get(field), 80).replace(/^@/, "") || null;
}

export async function updateSocialMedia(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");

  await prisma.creator.update({
    where: { userId: user.id },
    data: {
      tiktokUsername: readUsername(formData, "tiktokUsername"),
      tiktokFollowers: readFollowerCount(formData, "tiktokFollowers"),
      instagramUsername: readUsername(formData, "instagramUsername"),
      instagramFollowers: readFollowerCount(formData, "instagramFollowers"),
      youtubeUsername: readUsername(formData, "youtubeUsername"),
      youtubeFollowers: readFollowerCount(formData, "youtubeFollowers"),
      shopeeUsername: readUsername(formData, "shopeeUsername"),
      shopeeFollowers: readFollowerCount(formData, "shopeeFollowers"),
      tiktokAffiliateUsername: readUsername(formData, "tiktokAffiliateUsername"),
      tiktokAffiliateFollowers: readFollowerCount(formData, "tiktokAffiliateFollowers"),
    },
  });

  revalidatePath("/dashboard/profil");
  revalidatePath("/dashboard");
  return { success: true, completeness: await loadCompleteness(user.id) };
}

// ---------------------------------------------------------------------------
// Tab 4: Kategori
// ---------------------------------------------------------------------------

export async function updateKategori(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const creator = await prisma.creator.findUniqueOrThrow({ where: { userId: user.id }, select: { id: true } });
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  if (!categoryIds.length) return { error: "Pilih minimal satu kategori konten." };

  await prisma.$transaction(async (tx) => {
    await tx.creatorCategory.deleteMany({ where: { creatorId: creator.id } });
    await tx.creatorCategory.createMany({ data: categoryIds.map((categoryId) => ({ creatorId: creator.id, categoryId })) });
  });

  revalidatePath("/dashboard/profil");
  revalidatePath("/dashboard");
  return { success: true, completeness: await loadCompleteness(user.id) };
}
