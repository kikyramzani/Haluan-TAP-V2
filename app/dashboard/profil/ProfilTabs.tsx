"use client";

import { useState } from "react";
import DataPribadiForm, { type DataPribadiInput } from "./DataPribadiForm";
import AlamatForm, { type AlamatInput, type WilayahOption } from "./AlamatForm";
import SocialMediaForm, { type SocialMediaInput } from "./SocialMediaForm";
import KategoriForm, { type CategoryOption } from "./KategoriForm";

type TabKey = "data-pribadi" | "alamat" | "social-media" | "kategori";

const TABS: Array<[TabKey, string]> = [
  ["data-pribadi", "Data Pribadi"],
  ["alamat", "Alamat"],
  ["social-media", "Social Media"],
  ["kategori", "Kategori"],
];

export default function ProfilTabs({
  dataPribadi,
  alamat,
  provinces,
  initialRegencies,
  initialDistricts,
  initialVillages,
  socialMedia,
  categories,
  selectedCategoryIds,
}: {
  dataPribadi: DataPribadiInput;
  alamat: AlamatInput;
  provinces: WilayahOption[];
  initialRegencies: WilayahOption[];
  initialDistricts: WilayahOption[];
  initialVillages: WilayahOption[];
  socialMedia: SocialMediaInput;
  categories: CategoryOption[];
  selectedCategoryIds: string[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("data-pribadi");

  return (
    <section className="dashboard-section profil-tabs">
      <div className="profil-tab-nav" role="tablist" aria-label="Bagian profil">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? "active" : ""}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="form-panel">
        {activeTab === "data-pribadi" ? <DataPribadiForm initial={dataPribadi} /> : null}
        {activeTab === "alamat" ? (
          <AlamatForm
            initial={alamat}
            provinces={provinces}
            initialRegencies={initialRegencies}
            initialDistricts={initialDistricts}
            initialVillages={initialVillages}
          />
        ) : null}
        {activeTab === "social-media" ? <SocialMediaForm initial={socialMedia} /> : null}
        {activeTab === "kategori" ? <KategoriForm categories={categories} selectedCategoryIds={selectedCategoryIds} /> : null}
      </div>
    </section>
  );
}
