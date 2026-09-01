/**
 * The rules behind every badge a catalogue card may carry.
 *
 * They live here, not in the components, because each one is a claim to a
 * creator. "this ends in three days", "this pays ten points over open plan",
 * and a claim needs a unit test more than it needs a nicer border. Both catalogue
 * surfaces import the same rules, so the homepage and /deals can never disagree
 * about what a campaign is.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Campaigns run on Jakarta time; a browser in another zone must not shift the count. */
const CATALOG_TIME_ZONE = "Asia/Jakarta";

export function todayInJakarta(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CATALOG_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((carry, part) => (part.type === "literal" ? carry : { ...carry, [part.type]: part.value }), {});
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export type ExpiryState =
  | { kind: "none" }
  /** The sheet holds something that is not a readable date. Not a guess in either direction. */
  | { kind: "unverified"; raw: string }
  | { kind: "active"; daysLeft: number }
  | { kind: "ending"; daysLeft: number }
  | { kind: "expired"; daysAgo: number };

export const ENDING_SOON_DAYS = 14;

/**
 * Classifies a campaign's "31/12/2026" end date. Inclusive: a campaign whose last
 * day is today has not ended. A date the calendar rejects. 31/02 parses
 * arithmetically and means nothing. Is reported as unverified rather than being
 * silently dropped, because a row whose date cannot be trusted must not look like
 * a row whose date was checked.
 */
export function classifyExpiry(value: string | null | undefined, now: Date = new Date()): ExpiryState {
  if (!value || !value.trim()) return { kind: "none" };
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return { kind: "unverified", raw: value.trim() };
  const [, day, month, year] = match;
  const end = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const parsed = new Date(end);
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
    return { kind: "unverified", raw: value.trim() };
  }
  const days = Math.round((end - todayInJakarta(now)) / DAY_MS);
  if (days < 0) return { kind: "expired", daysAgo: -days };
  if (days <= ENDING_SOON_DAYS) return { kind: "ending", daysLeft: days };
  return { kind: "active", daysLeft: days };
}

export function expiryLabel(state: ExpiryState) {
  switch (state.kind) {
    case "ending":
      if (state.daysLeft === 0) return "Berakhir hari ini";
      if (state.daysLeft === 1) return "Berakhir besok";
      return `Berakhir ${state.daysLeft} hari lagi`;
    case "expired": return "Sudah berakhir";
    case "unverified": return "Tanggal perlu verifikasi";
    default: return null;
  }
}

/**
 * Whether a card may carry a promotional badge at all. "Sample support" and any
 * future benefit label. Expiry outranks promotion: a card must never advertise a
 * benefit and admit "already over" with the same visual weight. A date the sheet
 * cannot vouch for is treated the same way, because an unverified date is not
 * evidence that the campaign is still live.
 */
export function isPromotable(expiry: ExpiryState) {
  return expiry.kind !== "expired" && expiry.kind !== "unverified";
}

/** A campaign that has ended is information, not an offer: nothing to take. */
export function isActionable(expiry: ExpiryState) {
  return expiry.kind !== "expired";
}
