import sharp from "sharp";
import { put } from "@vercel/blob";

/**
 * Real uploads only — the Phase 2 migrated logos (public/brand-logos/*,
 * public/brand-logos-migrated/*) are never reprocessed through this path.
 * Bytes are decoded and re-encoded, never trusted by extension/MIME alone:
 * a mislabeled file (e.g. a script renamed to .png) fails sharp's decode and
 * is rejected, not silently passed through.
 */
export type ImageUploadResult = { ok: true; url: string } | { ok: false; reason: "TOO_LARGE" | "NOT_AN_IMAGE" | "SVG_REJECTED" | "UPLOAD_FAILED" };

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);

/**
 * SVG is rejected by signature before ever reaching sharp — an SVG is XML,
 * not raster data, and asking a decoder (even one with SVG support compiled
 * in) to process attacker-controlled XML is a risk this app doesn't need to
 * take for something as low-stakes as a brand logo.
 */
function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString("utf8").toLowerCase();
  return head.includes("<svg");
}

export async function processAndUploadLogo(buffer: Buffer, filenameHint: string): Promise<ImageUploadResult> {
  if (buffer.byteLength > MAX_BYTES) return { ok: false, reason: "TOO_LARGE" };
  if (looksLikeSvg(buffer)) return { ok: false, reason: "SVG_REJECTED" };

  let format: string | undefined;
  try {
    format = (await sharp(buffer).metadata()).format;
  } catch {
    return { ok: false, reason: "NOT_AN_IMAGE" };
  }
  if (!format || !ALLOWED_FORMATS.has(format)) return { ok: false, reason: "NOT_AN_IMAGE" };

  let webp: Buffer;
  try {
    webp = await sharp(buffer).webp({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, reason: "NOT_AN_IMAGE" };
  }

  const safeName = filenameHint.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 60) || "logo";
  try {
    const blob = await put(`brand-logos/${safeName}-${Date.now()}.webp`, webp, { access: "public", contentType: "image/webp" });
    return { ok: true, url: blob.url };
  } catch {
    return { ok: false, reason: "UPLOAD_FAILED" };
  }
}
