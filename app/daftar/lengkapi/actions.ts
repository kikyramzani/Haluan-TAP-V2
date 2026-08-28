"use server";

import { redirect } from "next/navigation";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";

export async function completeOnboarding(_prevState: unknown, formData: FormData) {
  const user = await requireUser("/dashboard");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const consent = formData.get("consent") === "on";

  if (name.length < 2) return { error: "Nama minimal 2 karakter." };
  if (phone.replace(/\D/g, "").length < 9) return { error: "Nomor WhatsApp tidak valid." };
  if (!categoryIds.length) return { error: "Pilih minimal satu kategori konten." };
  if (!consent) return { error: "Kamu perlu menyetujui Ketentuan untuk melanjutkan." };

  const normalizedPhone = phone.replace(/\D/g, "").replace(/^0/, "62");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { name, phone: normalizedPhone } });
    const creator = await tx.creator.upsert({
      where: { userId: user.id },
      create: { userId: user.id, onboardingCompletedAt: new Date() },
      update: { onboardingCompletedAt: new Date() },
    });
    await tx.creatorCategory.deleteMany({ where: { creatorId: creator.id } });
    await tx.creatorCategory.createMany({ data: categoryIds.map((categoryId) => ({ creatorId: creator.id, categoryId })) });
  });

  redirect("/dashboard");
}
