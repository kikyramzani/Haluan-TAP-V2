import { prisma } from "../../../../../lib/db";
import NewCampaignForm from "./NewCampaignForm";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function NewCampaignPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const brands = query
    ? await prisma.brand.findMany({
        where: { displayName: { contains: query, mode: "insensitive" } },
        orderBy: { displayName: "asc" },
        take: 30,
      })
    : [];

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>CAMPAIGN</span>
          <h1>Tambah campaign</h1>
        </div>
      </div>

      <form className="admin-filterbar" role="search">
        <label>
          ⌕
          <input type="search" name="q" defaultValue={query} placeholder="Cari nama brand…" />
        </label>
        <button type="submit">Cari</button>
      </form>

      <NewCampaignForm brands={brands.map((brand) => ({ id: brand.id, displayName: brand.displayName }))} query={query} />
    </>
  );
}
