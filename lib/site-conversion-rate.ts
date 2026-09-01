import { prisma } from "./db";
import { SAMPLE_WINDOW_DAYS } from "./hot-deals-config";

/**
 * The formula itself, pure. Shared so app/admin/(dashboard)/analitik/page.tsx
 * (which already has clicks/sampleRequests in memory from its own 30-day
 * queries) and the Hot Deals cron (which fetches its own) always agree,
 * without either duplicating the arithmetic or forcing an extra round-trip
 * on a page that already has the inputs.
 */
export function conversionRatePct(clicks: number, sampleRequests: number): number | null {
  return clicks > 0 ? (sampleRequests / clicks) * 100 : null;
}

/** For callers (the Hot Deals cron) that don't already have 30-day counts in hand. */
export async function siteWideConversionRatePct30d(now: Date = new Date()): Promise<number | null> {
  const windowStart = new Date(now.getTime() - SAMPLE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [clicks, sampleRequests] = await Promise.all([
    prisma.linkClick.count({ where: { createdAt: { gte: windowStart } } }),
    prisma.sampleRequest.count({ where: { createdAt: { gte: windowStart } } }),
  ]);
  return conversionRatePct(clicks, sampleRequests);
}
