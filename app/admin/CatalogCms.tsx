"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Campaign, CatalogIssue } from "../../lib/catalog";
import type { CampaignOverride, OverridePlatform } from "../../lib/catalog-overrides";
import { formatCommission } from "../../lib/commission";
import BrandMark from "../components/BrandMark";

/** Nilai mentah sheet untuk brand ini, sebelum override diterapkan. */
type SheetValues = {
  commission: number | null;
  tierCommissions: Array<number | null>;
  category: string;
  hasSample: boolean | null;
};

/** Server yang menghitung kunci brand, supaya rename tidak memutus jejaknya. */
type Row = {
  key: string;
  campaign: Campaign;
  sheet: SheetValues | null;
  override: CampaignOverride | null;
};

type Payload = {
  rows: Row[];
  issues: CatalogIssue[];
  overrideCount: number;
  platform: OverridePlatform;
};

type Draft = {
  brandKey: string;
  displayName: string;
  category: string;
  hasSample: "" | "true" | "false" | "unknown";
  hidden: boolean;
  ended: boolean;
  newSku: boolean;
  validUntil: string;
  logo: string | null | undefined;
  tiers: Array<{ index: number; commission: string; tapLink: string; label: string }>;
  manualTiers: Array<{ commission: string; tapLink: string; label: string; hasSample: boolean }>;
  mergedInto: string;
};

/** dd/mm/yyyy tersimpan -> yyyy-mm-dd yang dimengerti input tanggal. */
function toDateInput(value: string | undefined) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value?.trim() ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

const CATEGORIES = ["Beauty & Health", "Tech", "Home & Living", "Fashion", "Food & FMCG", "Mom & Baby", "Sports", "Lainnya"];
const MAX_LOGO_BYTES = 100_000;

function draftFrom(row: Row): Draft {
  const { campaign, sheet, override } = row;
  const tierCount = sheet?.tierCommissions.length ?? campaign.tierCommissions.length;
  return {
    brandKey: row.key,
    displayName: override?.displayName ?? "",
    category: override?.category ?? "",
    hasSample: override?.hasSample === undefined ? "" : override.hasSample === null ? "unknown" : String(override.hasSample) as "true" | "false",
    hidden: Boolean(override?.hidden),
    ended: Boolean(override?.ended),
    newSku: Boolean(override?.newSku),
    // Disimpan sebagai dd/mm/yyyy, ditampilkan sebagai yyyy-mm-dd untuk <input type="date">.
    validUntil: toDateInput(override?.validUntil),
    logo: override?.logo,
    tiers: Array.from({ length: tierCount }, (_, index) => {
      const edit = override?.tiers?.find((tier) => tier.index === index);
      return {
        index,
        commission: edit?.commission === undefined || edit.commission === null ? "" : String(edit.commission),
        tapLink: edit?.tapLink ?? "",
        label: edit?.label ?? "",
      };
    }),
    manualTiers: (override?.manualTiers ?? []).map((tier) => ({
      commission: tier.commission === null ? "" : String(tier.commission),
      tapLink: tier.tapLink,
      label: tier.label,
      hasSample: tier.hasSample,
    })),
    mergedInto: override?.mergedInto ?? "",
  };
}

export default function CatalogCms() {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "edited" | "no-commission" | "issues">("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Satu platform dirender sekaligus. Selain memisahkan override, ini juga
  // menahan jumlah baris: 395 + 383 kartu sekaligus membuat halaman ini berat.
  const [platform, setPlatform] = useState<OverridePlatform>("tiktok");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/catalog?platform=${platform}`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      setData(await response.json());
    } catch {
      setNotice("Katalog gagal dimuat. Coba muat ulang.");
    }
  }, [platform]);

  // Pemuatan pertama dilakukan langsung di dalam efek dengan AbortController,
  // supaya permintaan dibatalkan bila tab ditinggalkan sebelum selesai.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/catalog?platform=${platform}`, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload: Payload) => setData(payload))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setNotice("Katalog gagal dimuat. Coba muat ulang.");
      });
    return () => controller.abort();
  }, [platform]);

  const issuesByBrand = useMemo(() => {
    const grouped = new Map<string, CatalogIssue[]>();
    for (const issue of data?.issues ?? []) {
      const list = grouped.get(issue.brand) ?? [];
      list.push(issue);
      grouped.set(issue.brand, list);
    }
    return grouped;
  }, [data]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (needle && !row.campaign.brand.toLowerCase().includes(needle)) return false;
      if (filter === "edited") return Boolean(row.override);
      if (filter === "no-commission") return row.campaign.commission === null;
      if (filter === "issues") return issuesByBrand.has(row.campaign.brand);
      return true;
    });
  }, [data, query, filter, issuesByBrand]);

  function openEditor(row: Row) {
    setEditing(row.key);
    setDraft(draftFrom(row));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    try {
      const body: Record<string, unknown> = {
        brandKey: draft.brandKey,
        displayName: draft.displayName || undefined,
        category: draft.category || undefined,
        platform,
        hidden: draft.hidden,
        ended: draft.ended,
        newSku: draft.newSku,
        validUntil: draft.validUntil || null,
        mergedInto: draft.mergedInto || undefined,
      };
      if (draft.logo !== undefined) body.logo = draft.logo;
      if (draft.hasSample) body.hasSample = draft.hasSample === "unknown" ? null : draft.hasSample === "true";

      const tiers = draft.tiers
        .map((tier) => ({
          index: tier.index,
          commission: tier.commission === "" ? undefined : Number(tier.commission),
          tapLink: tier.tapLink || undefined,
          label: tier.label || undefined,
        }))
        .filter((tier) => tier.commission !== undefined || tier.tapLink || tier.label);
      if (tiers.length) body.tiers = tiers;

      const manualTiers = draft.manualTiers
        .filter((tier) => tier.tapLink.trim())
        .map((tier) => ({
          label: tier.label,
          commission: tier.commission === "" ? null : Number(tier.commission),
          tapLink: tier.tapLink.trim(),
          hasSample: tier.hasSample,
        }));
      if (manualTiers.length) body.manualTiers = manualTiers;

      const response = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "gagal");
      setEditing(null);
      setDraft(null);
      await load();
      setNotice("Perubahan tersimpan.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Perubahan belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function revert(row: Row) {
    if (!window.confirm(`Kembalikan ${row.campaign.brand} ke nilai spreadsheet? Seluruh perubahan manual brand ini dihapus.`)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/catalog?brandKey=${encodeURIComponent(row.key)}&platform=${platform}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error((await response.json()).error ?? "gagal");
      await load();
      setNotice(`${row.campaign.brand} kembali mengikuti spreadsheet.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal mengembalikan.");
    } finally {
      setBusy(false);
    }
  }

  function readLogo(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setNotice("Logo terlalu besar. Maksimal 100 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => (current ? { ...current, logo: String(reader.result) } : current));
    reader.readAsDataURL(file);
  }

  // Data platform sebelumnya masih tersimpan sesaat setelah pemilih diganti.
  // Kebasian itu diturunkan dari payload, bukan dari state yang disetel di
  // dalam efek, supaya tidak ada render tambahan hanya untuk mengosongkannya.
  if (!data || data.platform !== platform) {
    return (
      <section className="panel">
        <p>{notice || "Memuat katalog…"}</p>
      </section>
    );
  }

  const editingRow = data.rows.find((item) => item.key === editing);
  const editingCampaign = editingRow?.campaign;

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <div className="admin-toolbar">
        <select
          value={platform}
          onChange={(event) => {
            setEditing(null);
            setPlatform(event.target.value as OverridePlatform);
          }}
          aria-label="Platform katalog"
        >
          <option value="tiktok">TikTok Shop</option>
          <option value="shopee">Shopee Affiliate</option>
        </select>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari brand…"
          aria-label="Cari brand"
        />
        <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter baris">
          <option value="all">Semua brand ({data.rows.length})</option>
          <option value="edited">Diedit manual ({data.overrideCount})</option>
          <option value="no-commission">Komisi belum terbaca</option>
          <option value="issues">Punya baris bermasalah</option>
        </select>
        <button className="btn btn-secondary" type="button" onClick={() => void load()}>
          Muat ulang
        </button>
      </div>

      {notice ? <div className="form-alert form-alert-info">{notice}</div> : null}

      {data.issues.length ? (
        <details className="panel">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            {data.issues.length} baris ditolak parser, perbaiki di spreadsheet
          </summary>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", margin: "var(--space-3) 0" }}>
            Nilai ini tidak bisa dibaca dengan pasti, jadi tidak ditebak. Perbaiki di sheet lalu sinkronkan, atau timpa
            komisinya lewat editor brand.
          </p>
          <div>
            {data.issues.slice(0, 60).map((issue) => (
              <div className="issue-row" key={`${issue.brand}-${issue.row}-${issue.value}`}>
                <span className="issue-reason">Baris {issue.row}</span>
                <strong>{issue.brand}</strong>
                <code className="issue-value">{issue.value || "(kosong)"}</code>
                <span className="issue-reason">{issue.reason}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {rows.length === 0 ? (
        // Pencarian atau filter bisa menyisakan nol baris; tanpa pesan ini,
        // tabel kosong terbaca seperti data yang gagal dimuat, bukan hasil
        // pencarian yang memang tidak menemukan apa pun.
        <p className="admin-panel-empty">Tidak ada brand yang cocok dengan pencarian atau filter ini.</p>
      ) : null}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- pola region bisa-geser WAI-ARIA APG: tabIndex membuatnya terjangkau keyboard, persis yang dicek axe scrollable-region-focusable */}
      <div className="table-wrap" role="region" aria-label="Tabel katalog campaign, bisa digeser ke samping" tabIndex={0}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Kategori</th>
              <th className="numeric">Komisi</th>
              <th className="numeric">Campaign</th>
              <th>Sample</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const campaign = row.campaign;
              const changed = row.override && row.sheet && row.sheet.commission !== campaign.commission;
              return (
                <tr key={row.key}>
                  <td>
                    <span className="row-brand">
                      <BrandMark brand={campaign.brand} logoOverride={campaign.image} size={32} />
                      {campaign.brand}
                    </span>
                  </td>
                  <td>{campaign.category}</td>
                  <td className="numeric">
                    {formatCommission(campaign.commission)}
                    {changed ? <div className="issue-reason">sheet: {formatCommission(row.sheet!.commission)}</div> : null}
                  </td>
                  <td className="numeric">{campaign.campaignCount}</td>
                  <td>
                    {campaign.hasSample === null ? (
                      <span className="empty-cell">belum diketahui</span>
                    ) : campaign.hasSample ? (
                      "Tersedia"
                    ) : (
                      "Tidak"
                    )}
                  </td>
                  <td>
                    {row.override ? (
                      <span className="edited-marker">
                        {row.override.hidden ? "✗ Disembunyikan" : "✎ Diedit manual"}
                      </span>
                    ) : (
                      <span className="empty-cell">Dari sheet</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => openEditor(row)}>
                        Edit
                      </button>
                      {row.override ? (
                        <button type="button" className="danger" onClick={() => void revert(row)} disabled={busy}>
                          Reset
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingCampaign && draft ? (
        <div className="sheet-backdrop" data-open="true">
          <button
            className="sheet-scrim"
            type="button"
            tabIndex={-1}
            aria-label="Tutup editor"
            onClick={() => setEditing(null)}
          />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Edit ${editingCampaign.brand}`}>
            <header className="sheet-header">
              <BrandMark brand={editingCampaign.brand} logoOverride={draft.logo ?? editingCampaign.image} size={52} />
              <div className="sheet-title">
                <h2>{editingCampaign.brand}</h2>
                <p>Perubahan di sini menang atas spreadsheet.</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setEditing(null)} aria-label="Tutup editor">
                <span aria-hidden="true">✕</span>
              </button>
            </header>

            <div className="sheet-body">
              <div className="editor-grid">
                <div className="field">
                  <label htmlFor="cms-name">Nama tampil</label>
                  <input
                    id="cms-name"
                    value={draft.displayName}
                    placeholder={editingCampaign.brand}
                    onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                  />
                  <span className="field-hint">Kosongkan untuk mengikuti sheet.</span>
                </div>
                <div className="field">
                  <label htmlFor="cms-category">Kategori</label>
                  <select
                    id="cms-category"
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  >
                    <option value="">Ikuti sheet ({editingCampaign.category})</option>
                    {CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cms-sample">Sample support</label>
                  <select
                    id="cms-sample"
                    value={draft.hasSample}
                    onChange={(event) => setDraft({ ...draft, hasSample: event.target.value as Draft["hasSample"] })}
                  >
                    <option value="">Ikuti data sheet metrik</option>
                    <option value="true">Tersedia</option>
                    <option value="false">Tidak tersedia</option>
                    <option value="unknown">Belum diketahui</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <span>Logo brand</span>
                <div className="logo-picker">
                  <span className="logo-preview">
                    <BrandMark brand={editingCampaign.brand} logoOverride={draft.logo ?? editingCampaign.image} size={56} />
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) readLogo(file);
                    }}
                  />
                  {draft.logo ? (
                    <button className="btn btn-secondary" type="button" onClick={() => setDraft({ ...draft, logo: null })}>
                      Hapus logo
                    </button>
                  ) : null}
                </div>
                <span className="field-hint">PNG, JPEG, WebP, atau SVG. Maksimal 100 KB.</span>
              </div>

              <section className="sheet-section">
                <h3>Komisi per campaign</h3>
                <p className="field-hint" style={{ marginBottom: "var(--space-3)" }}>
                  Yang tampil di kartu adalah nilai terkecil. Kosongkan untuk mengikuti sheet.
                </p>
                <div className="tier-editor">
                  {draft.tiers.map((tier, position) => (
                    <div className="tier-row" key={tier.index}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={tier.commission}
                        placeholder={
                          editingRow?.sheet?.tierCommissions[tier.index] === null ||
                          editingRow?.sheet?.tierCommissions[tier.index] === undefined
                            ? "—"
                            : String(editingRow?.sheet?.tierCommissions[tier.index])
                        }
                        aria-label={`Komisi campaign ${position + 1}`}
                        onChange={(event) => {
                          const next = [...draft.tiers];
                          next[position] = { ...tier, commission: event.target.value };
                          setDraft({ ...draft, tiers: next });
                        }}
                      />
                      <input
                        type="url"
                        value={tier.tapLink}
                        placeholder="Ganti TAP link (opsional)"
                        aria-label={`TAP link campaign ${position + 1}`}
                        onChange={(event) => {
                          const next = [...draft.tiers];
                          next[position] = { ...tier, tapLink: event.target.value };
                          setDraft({ ...draft, tiers: next });
                        }}
                      />
                      <span className="issue-reason">#{position + 1}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="sheet-section">
                <h3>Campaign tambahan</h3>
                <p className="field-hint" style={{ marginBottom: "var(--space-3)" }}>
                  Untuk deal yang belum masuk spreadsheet.
                </p>
                <div className="tier-editor">
                  {draft.manualTiers.map((tier, position) => (
                    <div className="tier-row" key={position}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={tier.commission}
                        placeholder="Komisi %"
                        aria-label={`Komisi campaign tambahan ${position + 1}`}
                        onChange={(event) => {
                          const next = [...draft.manualTiers];
                          next[position] = { ...tier, commission: event.target.value };
                          setDraft({ ...draft, manualTiers: next });
                        }}
                      />
                      <input
                        type="url"
                        value={tier.tapLink}
                        placeholder="https://…"
                        aria-label={`TAP link campaign tambahan ${position + 1}`}
                        onChange={(event) => {
                          const next = [...draft.manualTiers];
                          next[position] = { ...tier, tapLink: event.target.value };
                          setDraft({ ...draft, manualTiers: next });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, manualTiers: draft.manualTiers.filter((_, i) => i !== position) })
                        }
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  style={{ marginTop: "var(--space-3)" }}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      manualTiers: [
                        ...draft.manualTiers,
                        { commission: "", tapLink: "", label: `Campaign ${draft.manualTiers.length + 1}`, hasSample: false },
                      ],
                    })
                  }
                >
                  + Tambah campaign
                </button>
              </section>

              <section className="sheet-section">
                <h3>Publikasi</h3>
                <div style={{ display: "grid", gap: "var(--space-3)" }}>
                  <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                    <input
                      type="checkbox"
                      checked={draft.hidden}
                      onChange={(event) => setDraft({ ...draft, hidden: event.target.checked })}
                    />
                    Sembunyikan brand ini dari katalog publik
                  </label>
                  <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                    <input
                      type="checkbox"
                      checked={draft.ended}
                      onChange={(event) => setDraft({ ...draft, ended: event.target.checked })}
                    />
                    Tandai campaign sudah berakhir
                  </label>
                  <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)" }}>
                    <input
                      type="checkbox"
                      checked={draft.newSku}
                      onChange={(event) => setDraft({ ...draft, newSku: event.target.checked })}
                    />
                    Tandai sebagai SKU baru
                  </label>
                  <div className="field">
                    <label htmlFor="cms-valid-until">Berlaku hingga</label>
                    <input
                      id="cms-valid-until"
                      type="date"
                      value={draft.validUntil}
                      onChange={(event) => setDraft({ ...draft, validUntil: event.target.value })}
                    />
                    <span className="field-hint">
                      Spreadsheet tidak punya kolom tanggal, jadi tanggal berakhir diisi di sini. Kosongkan bila
                      campaign belum punya batas waktu.
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor="cms-merge">Gabungkan ke brand lain</label>
                    <input
                      id="cms-merge"
                      value={draft.mergedInto}
                      placeholder="Nama brand tujuan, misal: Skintific"
                      onChange={(event) => setDraft({ ...draft, mergedInto: event.target.value })}
                    />
                    <span className="field-hint">
                      Brand ini akan hilang dari katalog. Pakai untuk blok duplikat di spreadsheet.
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <footer className="sheet-footer">
              <button className="btn btn-primary btn-block" type="button" onClick={() => void save()} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan perubahan"}
              </button>
              <button className="btn btn-ghost btn-block" type="button" onClick={() => setEditing(null)}>
                Batal
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
