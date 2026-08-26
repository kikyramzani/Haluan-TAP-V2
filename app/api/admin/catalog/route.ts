import { getAdminUser } from "@/lib/auth";
import { cleanText, sameOrigin } from "@/lib/security";
import { recordAudit } from "@/lib/audit";
import { brandKey } from "@/lib/brand-key";
import { getCampaignCatalogWithIssues } from "@/lib/campaign-links";
import { deleteOverride, getOverride, saveOverride } from "@/lib/catalog-store";
import type { CampaignOverride, OverridePlatform } from "@/lib/catalog-overrides";
import type { CampaignTier } from "@/lib/catalog";

const PRIVATE = { "cache-control": "private, no-store" };
const MAX_TIERS = 40;
/** Logo disimpan sebagai data URL di Redis, jadi ukurannya harus dibatasi. */
const MAX_LOGO_BYTES = 100_000;

function forbidden() {
  return Response.json({ error: "Akses ditolak." }, { status: 403 });
}

function parseCommission(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) return undefined;
  return Number(parsed.toFixed(2));
}

/** Hanya HTTPS yang diterima; link partner tidak boleh berupa skema lain. */
function parseTapLink(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (["localhost", "127.0.0.1"].includes(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseLogo(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value) return undefined;
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(value)) return undefined;
  if (value.length > MAX_LOGO_BYTES) return undefined;
  return value;
}

/**
 * Menerima `yyyy-mm-dd` dari input tanggal browser dan menyimpannya sebagai
 * `dd/mm/yyyy`, satu-satunya format yang dibaca `classifyExpiry`. Tanggal yang
 * tidak ada di kalender ditolak, bukan disimpan lalu tampil sebagai
 * "perlu verifikasi".
 */
function parseValidUntil(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }
  return `${day}/${month}/${year}`;
}

function parseTiers(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, MAX_TIERS)
    .map((item) => {
      const index = Number((item as { index?: unknown }).index);
      if (!Number.isInteger(index) || index < 0) return null;
      const entry: { index: number; commission?: number | null; tapLink?: string; label?: string } = { index };
      const commission = parseCommission((item as { commission?: unknown }).commission);
      if (commission !== undefined) entry.commission = commission;
      const tapLink = parseTapLink((item as { tapLink?: unknown }).tapLink);
      if (tapLink) entry.tapLink = tapLink;
      const label = cleanText((item as { label?: unknown }).label, 120);
      if (label) entry.label = label;
      return entry;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function parseManualTiers(value: unknown): CampaignTier[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(0, MAX_TIERS)
    .map((item, position) => {
      const tapLink = parseTapLink((item as { tapLink?: unknown }).tapLink);
      if (!tapLink) return null;
      const commission = parseCommission((item as { commission?: unknown }).commission);
      return {
        label: cleanText((item as { label?: unknown }).label, 120) || `Campaign ${position + 1}`,
        commission: commission === undefined ? null : commission,
        tapLink,
        hasSample: Boolean((item as { hasSample?: unknown }).hasSample),
      };
    })
    .filter((item): item is CampaignTier => item !== null);
}

/**
 * Platform yang sedang disunting. Apa pun selain "shopee" berarti TikTok,
 * sehingga permintaan lama yang tidak mengirim parameter ini tetap mendarat di
 * katalog yang sama seperti sebelumnya.
 */
function platformOf(value: unknown): OverridePlatform {
  return String(value ?? "").toLowerCase() === "shopee" ? "shopee" : "tiktok";
}

export async function GET(request: Request) {
  const actor = await getAdminUser();
  if (!actor) return forbidden();

  const platform = platformOf(new URL(request.url).searchParams.get("platform"));

  try {
    const { rows, issues, overrideCount } = await getCampaignCatalogWithIssues(platform);
    return Response.json({ rows, issues, overrideCount, platform }, { headers: PRIVATE });
  } catch {
    return Response.json({ error: "Katalog sedang tidak tersedia." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getAdminUser();
  if (!sameOrigin(request) || !actor) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const targetKey = brandKey(cleanText(body.brandKey, 120));
  if (!targetKey) return Response.json({ error: "Brand tidak dikenali." }, { status: 400 });

  const platform = platformOf(body.platform);
  const next: Omit<CampaignOverride, "updatedAt"> = { brandKey: targetKey, platform, updatedBy: actor.id };
  const displayName = cleanText(body.displayName, 120);
  if (displayName) next.displayName = displayName;
  const category = cleanText(body.category, 60);
  if (category) next.category = category;
  const logo = parseLogo(body.logo);
  if (logo !== undefined) next.logo = logo;
  if (typeof body.hidden === "boolean") next.hidden = body.hidden;
  if (typeof body.ended === "boolean") next.ended = body.ended;
  const validUntil = parseValidUntil(body.validUntil);
  if (validUntil !== undefined) next.validUntil = validUntil ?? undefined;
  if (body.hasSample === null || typeof body.hasSample === "boolean") next.hasSample = body.hasSample as boolean | null;
  if (typeof body.newSku === "boolean") next.newSku = body.newSku;
  const tiers = parseTiers(body.tiers);
  if (tiers?.length) next.tiers = tiers;
  const manualTiers = parseManualTiers(body.manualTiers);
  if (manualTiers?.length) next.manualTiers = manualTiers;
  const mergedInto = brandKey(cleanText(body.mergedInto, 120));
  if (mergedInto && mergedInto !== targetKey) next.mergedInto = mergedInto;

  try {
    const before = await getOverride(targetKey, platform);
    const saved = await saveOverride(next);
    await recordAudit({
      actorId: actor.id,
      action: "catalog.override.save",
      targetId: targetKey,
      before: before ?? null,
      after: saved,
    });
    return Response.json({ override: saved }, { headers: PRIVATE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TAP_DATASTORE_UNAVAILABLE") {
      return Response.json({ error: "Penyimpanan sedang tidak tersedia. Coba lagi sebentar." }, { status: 503 });
    }
    return Response.json({ error: "Perubahan belum tersimpan. Coba kembali." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const actor = await getAdminUser();
  if (!sameOrigin(request) || !actor) return forbidden();

  const params = new URL(request.url).searchParams;
  const targetKey = brandKey(cleanText(params.get("brandKey"), 120));
  if (!targetKey) return Response.json({ error: "Brand tidak dikenali." }, { status: 400 });
  const platform = platformOf(params.get("platform"));

  try {
    const before = await getOverride(targetKey, platform);
    if (!before) return Response.json({ error: "Tidak ada perubahan manual untuk brand ini." }, { status: 404 });
    await deleteOverride(targetKey, platform);
    await recordAudit({
      actorId: actor.id,
      action: "catalog.override.revert",
      targetId: targetKey,
      before,
      after: null,
    });
    return Response.json({ reverted: true }, { headers: PRIVATE });
  } catch {
    return Response.json({ error: "Perubahan belum dapat dikembalikan. Coba kembali." }, { status: 500 });
  }
}
