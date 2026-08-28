"use client";

import { useActionState } from "react";
import { createCampaign } from "../actions";

type Brand = { id: string; displayName: string };

export default function NewCampaignForm({ brands, query }: { brands: Brand[]; query: string }) {
  const [state, formAction, pending] = useActionState(createCampaign, null);

  return (
    <form action={formAction} className="admin-request-form">
      <label>
        <span>Brand</span>
        {brands.length ? (
          <select name="brandId" required defaultValue="">
            <option value="" disabled>
              Pilih brand…
            </option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.displayName}
              </option>
            ))}
          </select>
        ) : (
          <select name="brandId" disabled>
            <option value="">{query ? "Tidak ada brand yang cocok" : "Cari brand dulu di atas"}</option>
          </select>
        )}
      </label>
      <label>
        <span>Platform</span>
        <select name="platform" defaultValue="TIKTOK_SHOP">
          <option value="TIKTOK_SHOP">TikTok Shop</option>
          <option value="SHOPEE_AFFILIATE">Shopee</option>
        </select>
      </label>
      <label>
        <span>Tipe komisi</span>
        <select name="commissionType" defaultValue="PERSENTASE">
          <option value="PERSENTASE">Persentase</option>
          <option value="KETENTUAN_PLATFORM">Ketentuan platform</option>
        </select>
      </label>
      {state?.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="submit-btn" type="submit" disabled={pending || !brands.length}>
        {pending ? "Membuat…" : "Buat campaign"}
      </button>
    </form>
  );
}
