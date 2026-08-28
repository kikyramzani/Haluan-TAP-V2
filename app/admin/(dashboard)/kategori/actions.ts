"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { brandSlug } from "../../../../lib/brand-key";

export async function createCategory(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nama kategori wajib diisi." };

  const slug = brandSlug(name);
  if (!slug) return { error: "Nama kategori tidak valid." };

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return { error: "Kategori dengan nama (atau slug) yang sama sudah ada." };

  const category = await prisma.category.create({ data: { name, slug } });
  await recordAudit({ actorId: admin.id, action: "category.create", targetId: category.id, after: { name, slug } });
  revalidatePath("/admin/kategori");
  return { success: true };
}

export async function renameCategory(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Nama kategori wajib diisi." };

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) return { error: "Kategori tidak ditemukan." };

  const slug = brandSlug(name);
  if (!slug) return { error: "Nama kategori tidak valid." };

  if (slug !== before.slug) {
    const clash = await prisma.category.findUnique({ where: { slug } });
    if (clash && clash.id !== id) return { error: "Kategori dengan nama (atau slug) yang sama sudah ada." };
  }

  const updated = await prisma.category.update({ where: { id }, data: { name, slug } });
  await recordAudit({ actorId: admin.id, action: "category.rename", targetId: id, before: { name: before.name, slug: before.slug }, after: { name: updated.name, slug: updated.slug } });
  revalidatePath("/admin/kategori");
  return { success: true };
}

export async function deleteCategory(_prevState: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Kategori tidak valid." };

  const before = await prisma.category.findUnique({ where: { id } });
  if (!before) return { error: "Kategori tidak ditemukan." };

  const inUse = await prisma.brand.count({ where: { categoryId: id } });
  if (inUse > 0) return { error: `${inUse} brand masih memakai kategori ini.` };

  await prisma.category.delete({ where: { id } });
  await recordAudit({ actorId: admin.id, action: "category.delete", targetId: id, before: { name: before.name, slug: before.slug } });
  revalidatePath("/admin/kategori");
  return { success: true };
}
