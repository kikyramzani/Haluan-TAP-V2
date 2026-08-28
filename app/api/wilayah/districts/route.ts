import { prisma } from "../../../../lib/db";

/**
 * Public reference-data lookup for the Alamat tab's cascading selects
 * (app/dashboard/profil/AlamatForm.tsx). No auth: this returns only
 * wilayah names/ids, never creator PII, and the BPS data behind it is
 * already public.
 */
export async function GET(request: Request) {
  const regencyId = new URL(request.url).searchParams.get("regencyId")?.trim();
  if (!regencyId) return Response.json({ error: "regencyId wajib diisi." }, { status: 400 });

  const districts = await prisma.district.findMany({
    where: { regencyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ items: districts });
}
