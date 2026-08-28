import { prisma } from "../../../../lib/db";
import CreateCategoryForm from "./CreateCategoryForm";
import CategoryRow from "./CategoryRow";

export default async function AdminKategoriPage() {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { brands: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>KATEGORI</span>
          <h1>Kelola kategori brand</h1>
        </div>
      </div>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>BARU</span>
            <h2>Tambah kategori</h2>
          </div>
        </div>
        <CreateCategoryForm />
      </section>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Slug</th>
              <th>Brand</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <CategoryRow key={category.id} category={{ id: category.id, name: category.name, slug: category.slug, brandCount: category._count.brands }} />
            ))}
            {!categories.length ? (
              <tr>
                <td colSpan={4} className="empty-cell">
                  Belum ada kategori.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
