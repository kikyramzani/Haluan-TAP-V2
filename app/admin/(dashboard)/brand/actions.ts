"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { brandKey } from "../../../../lib/brand-key";
import { checkRateLimit, retryAfterMessage } from "../../../../lib/rate-limit";
import { processAndUploadLogo } from "../../../../lib/image-upload";

export async function createBrand(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  if (!displayName) return { error: "Nama brand wajib diisi." };

  const key = brandKey(displayName);
  const existing = await prisma.brand.findUnique({ where: { brandKey: key } });
  if (existing) return { error: "Brand dengan nama (atau ejaan) yang sama sudah ada." };

  const brand = await prisma.brand.create({ data: { brandKey: key, displayName, categoryId, logoUrl } });
  await recordAudit({ actorId: admin.id, action: "brand.create", targetId: brand.id, after: { displayName, categoryId, logoUrl } });
  revalidatePath("/admin/brand");
  return { success: true, id: brand.id };
}

export async function updateBrand(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;
  const hidden = formData.get("hidden") === "on";
  const featured = formData.get("featured") === "on";
  if (!id || !displayName) return { error: "Data brand tidak lengkap." };

  const before = await prisma.brand.findUnique({ where: { id } });
  if (!before) return { error: "Brand tidak ditemukan." };

  const updated = await prisma.brand.update({ where: { id }, data: { displayName, categoryId, logoUrl, hidden, featured } });
  await recordAudit({
    actorId: admin.id,
    action: "brand.update",
    targetId: id,
    before: { displayName: before.displayName, categoryId: before.categoryId, logoUrl: before.logoUrl, hidden: before.hidden, featured: before.featured },
    after: { displayName: updated.displayName, categoryId: updated.categoryId, logoUrl: updated.logoUrl, hidden: updated.hidden, featured: updated.featured },
  });
  revalidatePath("/admin/brand");
  revalidatePath(`/admin/brand/${id}`);
  return { success: true };
}

export async function mergeBrand(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const targetBrandKey = String(formData.get("targetBrandKey") ?? "").trim();
  if (!id || !targetBrandKey) return { error: "Pilih brand tujoan penggabungan." };
  const target = await prisma.brand.findUnique({ where: { brandKey: brandKey(targetBrandKey) } });
  if (!target || target.id === id) return { error: "Brand tujuan tidak valid." };

  await prisma.brand.update({ where: { id }, data: { mergedIntoId: target.id, hidden: true } });
  await recordAudit({ actorId: admin.id, action: "brand.merge", targetId: id, after: { mergedIntoId: target.id } });
  revalidatePath("/admin/brand");
  return { success: true };
}

const UPLOAD_ERROR_MESSAGES = {
  TOO_LARGE: "Ukuran file maksimal 5MB.",
  NOT_AN_IMAGE: "File bukan gambar yang didukung (JPEG/PNG/WebP/GIF/AVIF/TIFF).",
  SVG_REJECTED: "File SVG tidak diperbolehkan.",
  UPLOAD_FAILED: "Upload gagal, coba lagi.",
} as const;

export async function uploadBrandLogo(formData: FormData): Promise<{ url: string } | { error: string }> {
  const admin = await requireAdmin();
  const rate = await checkRateLimit("brand-logo-upload", admin.id, 30, 60);
  if (!rate.allowed) return { error: `Terlalu banyak upload. Coba lagi dalam ${retryAfterMessage(rate.retryAfterSeconds)}.` };

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Pilih file gambar terlebih dahulu." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processAndUploadLogo(buffer, file.name.replace(/\.[^./]+$/, ""));
  if (!result.ok) return { error: UPLOAD_ERROR_MESSAGES[result.reason] };

  await recordAudit({ actorId: admin.id, action: "brand.logo_upload", targetId: "logo", after: { url: result.url } });
  return { url: result.url };
}

type BulkAction = "activate" | "feature" | "unfeature" | "archive";

export async function bulkUpdateBrands(ids: string[], action: BulkAction) {
  const admin = await requireAdmin();
  if (!ids.length) return { error: "Pilih minimal satu brand." };
  const data = action === "activate" ? { hidden: false } : action === "archive" ? { hidden: true } : action === "feature" ? { featured: true } : { featured: false };
  await prisma.brand.updateMany({ where: { id: { in: ids } }, data });
  await recordAudit({ actorId: admin.id, action: `brand.bulk_${action}`, targetId: ids.join(","), after: { count: ids.length } });
  revalidatePath("/admin/brand");
  return { success: true };
}
