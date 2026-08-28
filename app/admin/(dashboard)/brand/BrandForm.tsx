"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrand, updateBrand } from "./actions";
import LogoUploadField from "./LogoUploadField";

type Category = { id: string; name: string };
type Brand = { id: string; displayName: string; categoryId: string | null; logoUrl: string | null; hidden: boolean; featured: boolean };

export default function BrandForm({ brand, categories }: { brand?: Brand; categories: Category[] }) {
  const router = useRouter();
  const action = brand ? updateBrand : createBrand;
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (state?.success) router.push("/admin/brand");
  }, [state, router]);

  return (
    <form action={formAction} className="admin-request-form">
      {brand ? <input type="hidden" name="id" value={brand.id} /> : null}
      <label>
        <span>Nama brand</span>
        <input name="displayName" defaultValue={brand?.displayName} required maxLength={120} />
      </label>
      <label>
        <span>Kategori</span>
        <select name="categoryId" defaultValue={brand?.categoryId ?? ""}>
          <option value="">Lainnya</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <LogoUploadField defaultValue={brand?.logoUrl} />
      {brand ? (
        <div className="two-col">
          <label className="checkbox">
            <input name="hidden" type="checkbox" defaultChecked={brand.hidden} />
            <span>Sembunyikan dari katalog</span>
          </label>
          <label className="checkbox">
            <input name="featured" type="checkbox" defaultChecked={brand.featured} />
            <span>Jadikan unggulan</span>
          </label>
        </div>
      ) : null}
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="submit-btn" type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan brand"}
      </button>
    </form>
  );
}
