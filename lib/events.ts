import { prisma } from "./db.ts";
import { hashIp } from "./hash-ip.ts";

const CLICK_RETENTION_MS = 1000 * 60 * 60 * 24 * 180;

/** campaignId here is the public slug (e.g. "somethinc", "shopee-somethinc"), same as every other lib/catalog-db.ts function. */
export async function recordClick(input: { userId: string; campaignId: string; referrer?: string; userAgent?: string; ip?: string; refCode?: string }) {
  const campaign = await prisma.campaign.findUnique({ where: { slug: input.campaignId }, select: { id: true } });
  if (!campaign) return null;
  let creatorId: string | null = null;
  if (input.userId && input.userId !== "anonymous") {
    const creator = await prisma.creator.findUnique({ where: { userId: input.userId }, select: { id: true } });
    creatorId = creator?.id ?? null;
  }
  return prisma.linkClick.create({
    data: {
      campaignId: campaign.id,
      creatorId,
      referrer: input.referrer,
      userAgent: input.userAgent,
      ipHash: input.ip ? hashIp(input.ip) : null,
      refCode: input.refCode,
    },
  });
}

export async function clickCount() {
  return prisma.linkClick.count();
}

export async function retainedClickCount() {
  return prisma.linkClick.count({ where: { createdAt: { gte: new Date(Date.now() - CLICK_RETENTION_MS) } } });
}

export async function clickMetrics(limit = 20) {
  const grouped = await prisma.linkClick.groupBy({
    by: ["campaignId"],
    _count: { campaignId: true },
    orderBy: { _count: { campaignId: "desc" } },
    take: limit,
  });
  const campaignRows = await prisma.campaign.findMany({
    where: { id: { in: grouped.map((g) => g.campaignId) } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(campaignRows.map((c) => [c.id, c.slug]));
  const [total, retained] = await Promise.all([clickCount(), retainedClickCount()]);
  return {
    total,
    retained,
    period: "lifetime" as const,
    retentionDays: CLICK_RETENTION_MS / 1000 / 86_400,
    campaigns: grouped.map((g) => ({ campaignId: slugById.get(g.campaignId) ?? g.campaignId, clicks: g._count.campaignId })),
  };
}
