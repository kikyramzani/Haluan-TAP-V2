"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../../lib/auth";
import { prisma } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { parseCsv } from "../../../../lib/catalog";
import { brandKey } from "../../../../lib/brand-key";

/**
 * The layout's requireAdmin() already gates /admin/*, but writing Brand rows
 * in bulk is sensitive enough that both the preview and the write action
 * must refuse a non-super-admin session directly, not just hide the button.
 */
async function requireSuperAdmin() {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") redirect("/admin?error=forbidden");
  return admin;
}

function truthy(value: string) {
  const clean = value.trim().toLowerCase();
  return clean === "true" || clean === "1" || clean === "yes" || clean === "ya";
}

function findColumn(headers: string[], candidates: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

type RawRow = { rowNumber: number; name: string; categoryName: string; logoUrl: string; hidden: boolean; featured: boolean };

/**
 * Recognizes name/category/logoUrl/hidden/featured only — the only columns
 * that map onto the Brand model. A "slug" column (mentioned in the source
 * spec) is intentionally ignored: Brand has no slug field, only brandKey()
 * derived from the name. Any other unrecognized header is ignored too.
 */
function parseRows(csv: string): { rows: RawRow[] } | { error: string } {
  const table = parseCsv(csv);
  if (!table.length) return { error: "CSV kosong." };

  const headers = table[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  const iName = findColumn(headers, ["name", "nama", "nama brand"]);
  if (iName < 0) return { error: "Kolom 'name' wajib ada di header CSV." };
  const iCategory = findColumn(headers, ["category", "kategori"]);
  const iLogo = findColumn(headers, ["logourl", "logo url", "logo"]);
  const iHidden = findColumn(headers, ["hidden", "sembunyikan", "sembunyi"]);
  const iFeatured = findColumn(headers, ["featured", "unggulan", "isfeatured"]);

  const rows: RawRow[] = table.slice(1).map((cells, index) => ({
    rowNumber: index + 2, // +1 for the header row, +1 for 1-indexing
    name: (cells[iName] ?? "").trim(),
    categoryName: iCategory >= 0 ? (cells[iCategory] ?? "").trim() : "",
    logoUrl: iLogo >= 0 ? (cells[iLogo] ?? "").trim() : "",
    hidden: iHidden >= 0 ? truthy(cells[iHidden] ?? "") : false,
    featured: iFeatured >= 0 ? truthy(cells[iFeatured] ?? "") : false,
  }));
  return { rows };
}

export type PreviewRow = {
  rowNumber: number;
  name: string;
  brandKeyValue: string;
  status: "new" | "updated" | "unchanged" | "failed";
  reason?: string;
  categoryId: string | null;
  categoryLabel: string;
  logoUrl: string;
  hidden: boolean;
  featured: boolean;
};

type PreviewOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: PreviewRow[];
      newCount: number;
      updatedCount: number;
      unchangedCount: number;
      failedCount: number;
      failedRows: Array<{ row: number; reason: string }>;
    };

/** A true dry run — no Prisma write happens here, only reads. */
async function buildPreview(csv: string): Promise<PreviewOutcome> {
  const parsed = parseRows(csv);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const categories = await prisma.category.findMany();
  const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));

  const rows: PreviewRow[] = [];
  const seenKeys = new Set<string>();

  for (const raw of parsed.rows) {
    if (!raw.name) {
      rows.push({
        rowNumber: raw.rowNumber,
        name: raw.name,
        brandKeyValue: "",
        status: "failed",
        reason: "Nama brand wajib diisi",
        categoryId: null,
        categoryLabel: raw.categoryName,
        logoUrl: raw.logoUrl,
        hidden: raw.hidden,
        featured: raw.featured,
      });
      continue;
    }

    const key = brandKey(raw.name);
    if (seenKeys.has(key)) {
      rows.push({
        rowNumber: raw.rowNumber,
        name: raw.name,
        brandKeyValue: key,
        status: "failed",
        reason: "Duplikat baris lain di file yang sama",
        categoryId: null,
        categoryLabel: raw.categoryName,
        logoUrl: raw.logoUrl,
        hidden: raw.hidden,
        featured: raw.featured,
      });
      continue;
    }
    seenKeys.add(key);

    const resolvedCategory = raw.categoryName ? categoryByName.get(raw.categoryName.toLowerCase()) : undefined;
    const categoryId = resolvedCategory?.id ?? null;
    const categoryLabel = resolvedCategory?.name ?? (raw.categoryName ? `${raw.categoryName} (tidak ditemukan)` : "");

    const existing = await prisma.brand.findUnique({ where: { brandKey: key } });
    if (!existing) {
      rows.push({ rowNumber: raw.rowNumber, name: raw.name, brandKeyValue: key, status: "new", categoryId, categoryLabel, logoUrl: raw.logoUrl, hidden: raw.hidden, featured: raw.featured });
      continue;
    }

    const changed =
      existing.displayName !== raw.name ||
      categoryId !== existing.categoryId ||
      (raw.logoUrl || null) !== existing.logoUrl ||
      raw.hidden !== existing.hidden ||
      raw.featured !== existing.featured;

    rows.push({
      rowNumber: raw.rowNumber,
      name: raw.name,
      brandKeyValue: key,
      status: changed ? "updated" : "unchanged",
      categoryId,
      categoryLabel,
      logoUrl: raw.logoUrl,
      hidden: raw.hidden,
      featured: raw.featured,
    });
  }

  const newCount = rows.filter((row) => row.status === "new").length;
  const updatedCount = rows.filter((row) => row.status === "updated").length;
  const unchangedCount = rows.filter((row) => row.status === "unchanged").length;
  const failedRows = rows.filter((row) => row.status === "failed").map((row) => ({ row: row.rowNumber, reason: row.reason ?? "Tidak valid" }));

  return { ok: true, rows, newCount, updatedCount, unchangedCount, failedCount: failedRows.length, failedRows };
}

export type PreviewState =
  | { error: string }
  | {
      success: true;
      csv: string;
      rows: PreviewRow[];
      newCount: number;
      updatedCount: number;
      unchangedCount: number;
      failedCount: number;
      failedRows: Array<{ row: number; reason: string }>;
    }
  | null;

export async function previewImport(_prevState: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireSuperAdmin();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Tempel atau unggah CSV terlebih dahulu." };

  const outcome = await buildPreview(csv);
  if (!outcome.ok) return { error: outcome.error };
  return {
    success: true,
    csv,
    rows: outcome.rows,
    newCount: outcome.newCount,
    updatedCount: outcome.updatedCount,
    unchangedCount: outcome.unchangedCount,
    failedCount: outcome.failedCount,
    failedRows: outcome.failedRows,
  };
}

type ImportSummary = {
  totalRows: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  written: number;
};

export type ConfirmState = { error: string } | { success: true; summary: ImportSummary } | null;

export async function confirmImport(_prevState: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const admin = await requireSuperAdmin();
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Data CSV tidak ditemukan, ulangi pratinjau." };

  const outcome = await buildPreview(csv);
  if (!outcome.ok) return { error: outcome.error };

  let written = 0;
  for (const row of outcome.rows) {
    if (row.status === "failed" || row.status === "unchanged") continue;
    await prisma.brand.upsert({
      where: { brandKey: row.brandKeyValue },
      create: {
        brandKey: row.brandKeyValue,
        displayName: row.name,
        categoryId: row.categoryId,
        logoUrl: row.logoUrl || null,
        hidden: row.hidden,
        featured: row.featured,
      },
      update: {
        displayName: row.name,
        categoryId: row.categoryId,
        logoUrl: row.logoUrl || null,
        hidden: row.hidden,
        featured: row.featured,
      },
    });
    written += 1;
  }

  const summary: ImportSummary = {
    totalRows: outcome.rows.length,
    newCount: outcome.newCount,
    updatedCount: outcome.updatedCount,
    unchangedCount: outcome.unchangedCount,
    failedCount: outcome.failedCount,
    written,
  };

  const run = await prisma.importRun.create({ data: { actorId: admin.id, summary } });
  await recordAudit({ actorId: admin.id, action: "brand.import", targetId: run.id, after: summary });

  revalidatePath("/admin/import");
  return { success: true, summary };
}
