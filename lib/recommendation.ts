/**
 * The "Untuk kamu" scoring rule from the doc: a simple, explainable score,
 * not a model. +3 kategori cocok, +2 brand yang linknya pernah diklik, +1
 * sample tersedia, +1 komisi di kuartil teratas, -2 kalau campaign berakhir
 * dalam 7 hari.
 *
 * Pure function. The caller precomputes the "is this in the top quartile
 * of active commissions" flag (needs the whole distribution, which doesn't
 * belong inside a per-campaign scoring function) and the "days until this
 * campaign ends" number.
 */

export type RecommendationInput = {
  categoryMatches: boolean;
  brandPreviouslyClicked: boolean;
  hasSample: boolean | null;
  isTopQuartileCommission: boolean;
  daysUntilEnd: number | null;
};

const ENDING_SOON_DAYS = 7;

export function scoreCampaignForCreator(input: RecommendationInput): number {
  let score = 0;
  if (input.categoryMatches) score += 3;
  if (input.brandPreviouslyClicked) score += 2;
  if (input.hasSample) score += 1;
  if (input.isTopQuartileCommission) score += 1;
  if (input.daysUntilEnd !== null && input.daysUntilEnd >= 0 && input.daysUntilEnd <= ENDING_SOON_DAYS) score -= 2;
  return score;
}

/** The 75th-percentile commission value in a set of active rates. Campaigns at or above this are "top quartile". Returns null when there's nothing to rank against. */
export function topQuartileThreshold(commissions: readonly number[]): number | null {
  if (!commissions.length) return null;
  const sorted = [...commissions].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.75);
  return sorted[Math.min(index, sorted.length - 1)];
}
