"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { brandKey } from "../../../../lib/brand-key";
import { checkRateLimit, retryAfterMessage } from "../../../../lib/rate-limit";
import { processAndUploadLogo } from "../../../../lib/image-upload";
import { validateLogoUrl } from "../../../../lib/logo-url";
import { CAMPAIGN_CATALOG_TAG } from "../../../../lib/catalog-db";

/**
 * Katalog publik di-cache 300 detik (lib/catalog-db.ts), dan sampai sekarang
 * tidak ada satu pun yang membatalkannya — aksi di berkas ini hanya menyegarkan
 * halaman /admin. Padahal keempat aksi di bawah mengubah nilai yang dibaca
 * toCampaign(): displayName, kategori, hidden, dan kini logoUrl.
 *
 * updateTag, bukan revalidateTag(tag, "max"): profil "max" menandai basi lalu
 * tetap MENYAJIKAN yang basi sambil menyegarkan di latar, sehingga admin yang
 * baru mengganti logo lalu langsung membuka /deals untuk memeriksa akan melihat
 * logo lama dan menyimpulkan tombolnya tidak bekerja. updateTag kedaluwarsa
 * seketika (read-your-own-writes) dan hanya sah dipanggil dari Server Action —
 * di dalam route handler ia melempar.
 */
function revalidateBrandSurfaces(id?: string) {
  revalidatePath("/admin/brand");
  if (id) revalidatePath(`/admin/brand/${id}`);
  updateTag(CAMPAIGN_CATALOG_TAG);
}

export async function createBrand(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const logo = validateLogoUrl(String(formData.get("logoUrl") ?? ""));
  if (!displayName) return { error: "Nama brand wajib diisi." };
  if (!logo.ok) return { error: logo.message };
  const logoUrl = logo.value;

  const key = brandKey(displayName);
  const existing = await prisma.brand.findUnique({ where: { brandKey: key } });
  if (existing) return { error: "Brand dengan nama (atau ejaan) yang sama sudah ada." };

  const brand = await prisma.brand.create({ data: { brandKey: key, displayName, categoryId, logoUrl } });
  await recordAudit({ actorId: admin.id, action: "brand.create", targetId: brand.id, after: { displayName, categoryId, logoUrl } });
  revalidateBrandSurfaces();
  return { success: true, id: brand.id };
}

export async function updateBrand(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const logo = validateLogoUrl(String(formData.get("logoUrl") ?? ""));
  const hidden = formData.get("hidden") === "on";
  const featured = formData.get("featured") === "on";
  if (!id || !displayName) return { error: "Data brand tidak lengkap." };
  if (!logo.ok) return { error: logo.message };
  const logoUrl = logo.value;

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
  revalidateBrandSurfaces(id);
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
  revalidateBrandSurfaces(id);
  return { success: true };
}

const UPLOAD_ERROR_MESSAGES = {
  TOO_LARGE: "Ukuran file maksimal 5MB.",
  NOT_AN_IMAGE: "File bukan gambar yang didukung (JPEG/PNG/WebP/GIF/AVIF/TIFF).",
  SVG_REJECTED: "File SVG tidak diperbolehkan.",
  HEIC_UNSUPPORTED: "Foto HEIC dari iPhone belum didukung. Simpan ulang sebagai JPEG atau PNG, lalu unggah lagi.",
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
  revalidateBrandSurfaces();
  return { success: true };
}
