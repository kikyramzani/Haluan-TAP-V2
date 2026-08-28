import { prisma } from "../../../../../lib/db";
import BrandForm from "../BrandForm";

export default async function NewBrandPage() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <div className="panel-heading">
        <div>
          <span>BRAND</span>
          <h1>Tambah brand</h1>
        </div>
      </div>
      <BrandForm categories={categories} />
    </>
  );
}
