import { randomUUID } from "node:crypto";
import { key, redis, setJson } from "./redis.ts";
import type { ClickEvent } from "./models.ts";

const CLICK_RETENTION_SECONDS = 60 * 60 * 24 * 180;

async function pruneExpiredClicks() {
  const cutoff = Date.now() - CLICK_RETENTION_SECONDS * 1000;
  await redis("ZREMRANGEBYSCORE", key("clicks"), "-inf", cutoff);
}

export async function recordClick(input: Omit<ClickEvent, "id" | "createdAt">) {
  const event: ClickEvent = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  await Promise.all([
    setJson(key("click", event.id), event, CLICK_RETENTION_SECONDS),
    redis("ZADD", key("clicks"), Date.now(), event.id),
    redis("ZADD", key("campaigns", "clicked"), Date.now(), input.campaignId),
    // Lifetime counters carry the headline number and the per-campaign breakdown
    // so both describe the same period. The event bodies are what expire after
    // 180 days, and they exist for investigation rather than for the KPI.
    redis("INCR", key("clicks", "lifetime")),
    redis("INCR", key("campaign", input.campaignId, "clicks")),
    redis("INCR", key("user", input.userId, "clicks")),
  ]);
  return event;
}

/**
 * Opens counted since launch. Matches the per-campaign counters exactly, and
 * seeds itself from them once so deployments that predate this counter do not
 * report a headline smaller than the breakdown beneath it.
 */
export async function clickCount() {
  const stored = await redis<string | number | null>("GET", key("clicks", "lifetime"));
  if (stored !== null && stored !== undefined) return Number(stored);
  const campaignIds = await redis<string[]>("ZREVRANGE", key("campaigns", "clicked"), 0, -1);
  const counters = await Promise.all((campaignIds ?? []).map(async (campaignId) =>
    Number(await redis<string | number | null>("GET", key("campaign", campaignId, "clicks")) ?? 0)));
  const seeded = counters.reduce((sum, value) => sum + value, 0);
  await redis("SET", key("clicks", "lifetime"), seeded, "NX");
  return seeded;
}

/** Opens still backed by a stored event, i.e. the last 180 days. */
export async function retainedClickCount() {
  await pruneExpiredClicks();
  return Number(await redis<number>("ZCARD", key("clicks")) ?? 0);
}

export async function clickMetrics(limit = 20) {
  const campaignIds = await redis<string[]>("ZREVRANGE", key("campaigns", "clicked"), 0, limit - 1);
  const campaigns = await Promise.all((campaignIds ?? []).map(async (campaignId) => ({
    campaignId,
    clicks: Number(await redis<string | number | null>("GET", key("campaign", campaignId, "clicks")) ?? 0),
  })));
  const [total, retained] = await Promise.all([clickCount(), retainedClickCount()]);
  return {
    total,
    retained,
    period: "lifetime" as const,
    retentionDays: CLICK_RETENTION_SECONDS / 86_400,
    campaigns: campaigns.sort((a, b) => b.clicks - a.clicks),
  };
}
