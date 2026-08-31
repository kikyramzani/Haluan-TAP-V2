"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Campaign } from "../../lib/catalog";
import { classifyExpiry, isActionable } from "../../lib/campaign-flags";
import BrandCard from "./BrandCard";
import CampaignSheet from "./CampaignSheet";
import Icon, { type IconName } from "./Icon";
import { HOT_BADGE_LABEL, HOT_BADGE_ICON, HOT_BADGE_ORDER, liveHotBadge } from "./HotBadge";
import type { HotBadge as HotBadgeId } from "../../lib/hot-deals-config";

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

/**
 * Ikon per kategori, dikunci ke nama kategori persis. Admin bisa menambah
 * kategori kapan saja lewat /admin/kategori, jadi yang tidak dikenal jatuh ke
 * ikon tag generik — bukan ikon kosong, bukan error.
 */
const CATEGORY_ICON: Record<string, IconName> = {
  "Beauty & Health": "sparkle",
  Tech: "device-mobile",
  "Home & Living": "couch",
  Fashion: "t-shirt",
  "Mom & Baby": "baby",
  "Food & FMCG": "fork-knife",
  Sports: "barbell",
};

const categoryIcon = (name: string): IconName => CATEGORY_ICON[name] ?? "tag";

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
  const [popular, setPopular] = useState<"" | "any" | HotBadgeId>("");
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

  // Chip popularitas dibangun dari hitungan, bukan didaftar keras: jenis badge
  // yang baru diraih cron besok otomatis dapat chip. Dihitung terhadap daftar
  // dasar (bukan hasil filter berjalan), sama seperti sampleCount, supaya
  // angkanya tidak berkedip tiap ketikan di kotak pencarian.
  const badgeCounts = useMemo(() => {
    const counts = new Map<HotBadgeId, number>();
    for (const item of campaigns) {
      const badge = liveHotBadge(item);
      if (badge) counts.set(badge, (counts.get(badge) ?? 0) + 1);
    }
    return counts;
  }, [campaigns]);

  const badgedTotal = useMemo(() => [...badgeCounts.values()].reduce((sum, n) => sum + n, 0), [badgeCounts]);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    const bandRule = COMMISSION_BANDS.find((item) => item.id === band);

    const matched = campaigns.filter((item) => {
      if (category && item.category !== category) return false;
      if (popular) {
        const badge = liveHotBadge(item);
        if (!badge) return false;
        if (popular !== "any" && badge !== popular) return false;
      }
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
  }, [campaigns, query, category, band, sampleOnly, sort, popular]);

  // Halaman kembali ke awal setiap kali filter berubah. Disesuaikan saat render
  // — bukan lewat useEffect — supaya tidak ada render perantara yang sempat
  // menampilkan potongan daftar dengan panjang lama.
  const filterKey = `${query}|${category}|${band}|${sampleOnly}|${sort}|${popular}`;
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
    setPopular("");
  }, []);

  const hasFilters = Boolean(query || category || band || sampleOnly || popular);

  return (
    <>
      {!isPreview ? (
        <div className="catalog-controls">
          <div className="search-field">
            <span className="search-icon" aria-hidden="true">
              <Icon name="magnifying-glass" />
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
                <Icon name="x" />
              </button>
            ) : (
              <span className="search-hint" aria-hidden="true">
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </span>
            )}
          </div>

          {badgedTotal > 0 ? (
            <div className="filter-row">
              <div className="filter-chips" role="group" aria-label="Filter popularitas">
                {/* "Paling populer" hanya muncul kalau ada lebih dari satu jenis
                    badge — dengan satu jenis, hasilnya identik dengan chip jenis
                    itu sendiri, jadi chip keduanya cuma beban. */}
                {badgeCounts.size > 1 ? (
                  <button
                    className="chip"
                    type="button"
                    aria-pressed={popular === "any"}
                    onClick={() => setPopular((value) => (value === "any" ? "" : "any"))}
                  >
                    <Icon name="fire" /> Paling populer <span className="chip-count">{badgedTotal}</span>
                  </button>
                ) : null}
                {HOT_BADGE_ORDER.filter((id) => (badgeCounts.get(id) ?? 0) > 0).map((id) => (
                  <button
                    key={id}
                    className="chip"
                    type="button"
                    aria-pressed={popular === id}
                    onClick={() => setPopular((value) => (value === id ? "" : id))}
                  >
                    <Icon name={HOT_BADGE_ICON[id]} /> {HOT_BADGE_LABEL[id]}{" "}
                    <span className="chip-count">{badgeCounts.get(id)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="filter-row">
            <div className="filter-chips" role="group" aria-label="Filter kategori">
              <button className="chip" type="button" aria-pressed={!category} onClick={() => setCategory("")}>
                <Icon name="squares-four" /> Semua <span className="chip-count">{campaigns.length}</span>
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  className="chip"
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(category === name ? "" : name)}
                >
                  <Icon name={categoryIcon(name)} /> {name} <span className="chip-count">{count}</span>
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
                      <Icon name="percent" /> {item.label}
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
                  <Icon name="check" /> Sample tersedia <span className="chip-count">{sampleCount}</span>
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
