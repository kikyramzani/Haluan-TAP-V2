import { prisma } from "../../../../lib/db";

/**
 * Public reference-data lookup for the Alamat tab's cascading selects
 * (app/dashboard/profil/AlamatForm.tsx). No auth: this returns only
 * wilayah names/ids, never creator PII, and the BPS data behind it is
 * already public.
 */
export async function GET(request: Request) {
  const districtId = new URL(request.url).searchParams.get("districtId")?.trim();
  if (!districtId) return Response.json({ error: "districtId wajib diisi." }, { status: 400 });

  const villages = await prisma.village.findMany({
    where: { districtId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ items: villages });
}
