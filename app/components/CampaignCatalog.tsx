"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Campaign } from "../../lib/catalog";
import { classifyExpiry, isActionable } from "../../lib/campaign-flags";
import BrandCard from "./BrandCard";
import CampaignSheet from "./CampaignSheet";

const PAGE_SIZE = 24;

const COMMISSION_BANDS = [
  { id: "0-5", label: "Di bawah 5%", test: (rate: number) => rate < 5 },
  { id: "5-10", label: "5–10%", test: (rate: number) => rate >= 5 && rate < 10 },
  { id: "10-15", label: "10–15%", test: (rate: number) => rate >= 10 && rate < 15 },
  { id: "15+", label: "15% ke atas", test: (rate: number) => rate >= 15 },
] as const;

const SORTS = [
  { id: "recommended", label: "Rekomendasi" },
  { id: "commission-desc", label: "Komisi tertinggi" },
  { id: "commission-asc", label: "Komisi terendah" },
  { id: "brand", label: "Nama brand" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

/** Menyamakan huruf besar-kecil dan diakritik supaya "L'Oréal" cocok dengan "loreal". */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Props = {
  campaigns: Campaign[];
  /** Beranda hanya menampilkan cuplikan tanpa kontrol filter. */
  variant?: "full" | "preview";
  previewLimit?: number;
  initialQuery?: string;
  initialCategory?: string;
  /** Shopee tidak punya kolom komisi sama sekali, jadi filter/sort komisi disembunyikan. */
  platform?: "tiktok" | "shopee";
};

export default function CampaignCatalog({
  campaigns,
  variant = "full",
  previewLimit = 6,
  initialQuery = "",
  initialCategory = "",
  platform,
}: Props) {
  const isPreview = variant === "preview";
  const isShopee = platform === "shopee";
  const sorts = isShopee ? SORTS.filter((option) => !option.id.startsWith("commission-")) : SORTS;
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [band, setBand] = useState("");
  const [sampleOnly, setSampleOnly] = useState(false);
  const [sort, setSort] = useState<SortId>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of campaigns) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [campaigns]);

  // Filter sample hanya ditawarkan bila datanya memang ada, supaya tidak ada
  // filter yang selalu menghasilkan nol.
  const sampleCount = useMemo(() => campaigns.filter((item) => item.hasSample === true).length, [campaigns]);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    const bandRule = COMMISSION_BANDS.find((item) => item.id === band);

    const matched = campaigns.filter((item) => {
      if (category && item.category !== category) return false;
      if (sampleOnly && item.hasSample !== true) return false;
      if (bandRule) {
        if (item.commission === null) return false;
        if (!bandRule.test(item.commission)) return false;
      }
      if (!needle) return true;
      return normalize(`${item.brand} ${item.campaign} ${item.category}`).includes(needle);
    });

    const ended = (item: Campaign) => Number(!isActionable(classifyExpiry(item.expiresAt)));
    return [...matched].sort((a, b) => {
      // Campaign yang sudah berakhir selalu turun ke bawah, apa pun urutannya.
      const endedRank = ended(a) - ended(b);
      if (endedRank) return endedRank;

      if (sort === "brand") return a.brand.localeCompare(b.brand);
      if (sort === "commission-desc") return (b.commission ?? -1) - (a.commission ?? -1) || a.brand.localeCompare(b.brand);
      if (sort === "commission-asc") {
        if (a.commission === null) return 1;
        if (b.commission === null) return -1;
        return a.commission - b.commission || a.brand.localeCompare(b.brand);
      }
      return 0; // Urutan bawaan sudah "Rekomendasi" dari server.
    });
  }, [campaigns, query, category, band, sampleOnly, sort]);

  // Halaman kembali ke awal setiap kali filter berubah. Disesuaikan saat render
  // — bukan lewat useEffect — supaya tidak ada render perantara yang sempat
  // menampilkan potongan daftar dengan panjang lama.
  const filterKey = `${query}|${category}|${band}|${sampleOnly}|${sort}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisible(PAGE_SIZE);
  }

  const shown = isPreview ? filtered.slice(0, previewLimit) : filtered.slice(0, visible);

  // Menyimpan pencarian dan kategori di URL supaya hasil filter bisa dibagikan.
  useEffect(() => {
    if (isPreview) return;
    const params = new URLSearchParams(window.location.search);
    if (query) params.set("q", query);
    else params.delete("q");
    if (category) params.set("kategori", category);
    else params.delete("kategori");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
  }, [query, category, isPreview]);

  useEffect(() => {
    if (isPreview) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreview]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setCategory("");
    setBand("");
    setSampleOnly(false);
  }, []);

  const hasFilters = Boolean(query || category || band || sampleOnly);

  return (
    <>
      {!isPreview ? (
        <div className="catalog-controls">
          <div className="search-field">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari brand atau campaign…"
              aria-label="Cari brand atau campaign"
              autoComplete="off"
            />
            {query ? (
              <button className="search-clear" type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian">
                <span aria-hidden="true">✕</span>
              </button>
            ) : (
              <span className="search-hint" aria-hidden="true">
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </span>
            )}
          </div>

          <div className="filter-row">
            <div className="filter-chips" role="group" aria-label="Filter kategori">
              <button className="chip" type="button" aria-pressed={!category} onClick={() => setCategory("")}>
                Semua <span className="chip-count">{campaigns.length}</span>
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  className="chip"
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(category === name ? "" : name)}
                >
                  {name} <span className="chip-count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <div className="sort-control">
              <label htmlFor="catalog-sort">Urutkan</label>
              <select
                id="catalog-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortId)}
              >
                {sorts.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-chips" role="group" aria-label="Filter komisi dan sample">
              {!isShopee
                ? COMMISSION_BANDS.map((item) => (
                    <button
                      key={item.id}
                      className="chip"
                      type="button"
                      aria-pressed={band === item.id}
                      onClick={() => setBand(band === item.id ? "" : item.id)}
                    >
                      {item.label}
                    </button>
                  ))
                : null}
              {sampleCount > 0 ? (
                <button
                  className="chip"
                  type="button"
                  aria-pressed={sampleOnly}
                  onClick={() => setSampleOnly((value) => !value)}
                >
                  ✓ Sample tersedia <span className="chip-count">{sampleCount}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!isPreview ? (
        <p className="result-line" aria-live="polite">
          <strong>{filtered.length}</strong> brand ditemukan
          {hasFilters ? " dari filter yang kamu pilih" : ""}
        </p>
      ) : null}

      {shown.length ? (
        <div className="deal-grid">
          {shown.map((item, index) => (
            <BrandCard key={item.id} campaign={item} onOpen={setSelected} priority={index < 4} />
          ))}
        </div>
      ) : (
        <div className="state-panel">
          <h3>Belum ada deal yang cocok</h3>
          <p>Coba ubah kata pencarian atau lepas sebagian filter kamu.</p>
          <button className="btn btn-secondary" type="button" onClick={clearFilters}>
            Reset filter
          </button>
        </div>
      )}

      {!isPreview && filtered.length > visible ? (
        <div className="load-more">
          <button className="btn btn-secondary" type="button" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
            Muat {Math.min(PAGE_SIZE, filtered.length - visible)} deal lagi
          </button>
        </div>
      ) : null}

      <CampaignSheet campaign={selected} onClose={() => setSelected(null)} />
    </>
  );
}
