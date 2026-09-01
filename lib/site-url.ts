/**
 * The canonical origin for absolute URLs. Canonical tags, sitemap, OG.
 *
 * The official domain is the default, not an env override waiting to be set. Two
 * live hosts serving identical content with a canonical pointing at the *secondary*
 * one is a self-inflicted duplicate-content signal, and it should not depend on
 * someone remembering to set a variable. NEXT_PUBLIC_SITE_URL still wins when an
 * environment genuinely needs a different origin (a preview, a staging host).
 */
export const CANONICAL_SITE_URL = "https://tap.haluan.digital";

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return CANONICAL_SITE_URL;
}
