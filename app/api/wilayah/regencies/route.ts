import { prisma } from "../../../../lib/db";

/**
 * Public reference-data lookup for the Alamat tab's cascading selects
 * (app/dashboard/profil/AlamatForm.tsx). No auth: this returns only
 * wilayah names/ids, never creator PII, and the BPS data behind it is
 * already public.
 */
export async function GET(request: Request) {
  const provinceId = new URL(request.url).searchParams.get("provinceId")?.trim();
  if (!provinceId) return Response.json({ error: "provinceId wajib diisi." }, { status: 400 });

  const regencies = await prisma.regency.findMany({
    where: { provinceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ items: regencies });
}
