import { prisma } from "../../../lib/db";

/**
 * Postgres-backed replacement for the old Sheets/Redis readiness check
 * (Phase 8 — the public catalog now reads Campaign/Brand rows, not live
 * CSV sources, so a source-configured check no longer means anything).
 * A cheap connectivity probe plus "the catalog actually has rows" is the
 * equivalent signal: the datastore answers, and it isn't empty.
 */
export async function GET() {
  try {
    const [, campaignCount] = await Promise.all([prisma.$queryRaw`SELECT 1`, prisma.campaign.count()]);
    const checks = {
      database: true,
      catalogPopulated: campaignCount > 0,
      googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      adminAllowlist: Boolean(process.env.ADMIN_EMAILS),
    };
    const critical = checks.database && checks.catalogPopulated && checks.adminAllowlist;
    return Response.json({ status: critical ? "ready" : "configuration_required", checks }, { status: critical ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "configuration_required", checks: { database: false } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
