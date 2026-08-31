/**
 * Tunable thresholds for the "Hot Deals" ranking — see the recompute logic
 * in app/admin/(dashboard)/campaign/engagement-stats.ts. Every number here
 * is a floor against noise, not a target to fabricate: a badge that never
 * fires because real traffic hasn't reached the floor is the correct
 * outcome, not a bug.
 */
export const CLICK_WINDOW_DAYS = 7;
export const SAMPLE_WINDOW_DAYS = 30;

/** "Trending": needs real volume, not just "most of a near-zero pool". */
export const TRENDING_MIN_CLICKS_7D = 20;
export const TRENDING_TOP_FRACTION = 0.1; // top decile of campaigns with clicks7d > 0

/** "Tinggi konversi": floor prevents 1-sample/1-click = "100%" noise. */
export const CONVERSION_MIN_CLICKS_30D = 20;
/** Must beat the real, same-run, site-wide 30-day conversion rate by this
 *  multiplier — not a guessed absolute percentage. */
export const CONVERSION_RATE_MULTIPLIER = 1.5;
/** Absolute floor in case the site-wide rate itself is near zero. */
export const CONVERSION_RATE_FLOOR_PCT = 5;

/** "Banyak peminat": SampleRequest is an authenticated, deliberate action —
 *  even single digits are meaningful this early. */
export const DEMAND_MIN_SCORE = 5; // savedCount + sampleRequests30d

export type HotBadge = "TOP_BRAND" | "TRENDING" | "HIGH_CONVERSION" | "HIGH_DEMAND";

export type HotBadgeInput = {
  featured: boolean;
  clicks7d: number;
  clicks30d: number;
  sampleRequests30d: number;
  savedCount: number;
  /** Lowest clicks7d that still lands in the top decile this run, or Infinity when nothing has clicks yet. */
  trendingRankCutoff: number;
  /** max(siteWideRate × multiplier, floor) — computed from real site-wide data, not hardcoded. */
  conversionBar: number;
};

/**
 * The whole ranking rule, pure so it can be unit-tested without a database —
 * same split as lib/recommendation.ts / lib/sample-gate.ts.
 *
 * First match wins; one badge per campaign, never stacked. Returning null is
 * a correct outcome, not a failure: it means this campaign genuinely hasn't
 * earned a spot on the rail, and it must not appear there.
 */
export function resolveHotBadge(input: HotBadgeInput): HotBadge | null {
  if (input.featured) return "TOP_BRAND";
  if (input.clicks7d >= TRENDING_MIN_CLICKS_7D && input.clicks7d >= input.trendingRankCutoff) return "TRENDING";
  if (input.clicks30d >= CONVERSION_MIN_CLICKS_30D) {
    const rate = (input.sampleRequests30d / input.clicks30d) * 100;
    if (rate >= input.conversionBar) return "HIGH_CONVERSION";
  }
  if (input.savedCount + input.sampleRequests30d >= DEMAND_MIN_SCORE) return "HIGH_DEMAND";
  return null;
}
