import { randomUUID } from "node:crypto";
import { getJson, getJsonMany, key, redis, setJson } from "./redis.ts";
import type { SampleRequest, SampleStatus } from "./models.ts";
import { SAMPLE_STATUS_TRANSITIONS } from "./sample-status.ts";
import { bumpCollectionRevision, createFilterCache, currentCollectionRevision } from "./filter-cache.ts";
import { withRecordLock } from "./mutation.ts";

const requestFilterCache = createFilterCache<SampleRequest[]>();

async function bumpRequestRevision() {
  requestFilterCache.clear();
  await bumpCollectionRevision("samples");
}

export async function createSampleRequest(input: Omit<SampleRequest, "id" | "status" | "createdAt" | "updatedAt">) {
  const id = `TAP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const request: SampleRequest = { ...input, id, status: "submitted", createdAt: now, updatedAt: now };
  await Promise.all([
    setJson(key("sample", id), request),
    redis("ZADD", key("samples"), Date.now(), id),
    redis("ZADD", key("user", input.userId, "samples"), Date.now(), id),
  ]);
  await bumpRequestRevision();
  return request;
}

export async function createSampleRequests(inputs: Array<Omit<SampleRequest, "id" | "status" | "createdAt" | "updatedAt">>) {
  if (!inputs.length) return [];
  const groupId = inputs.length > 1 ? `GRP-${randomUUID().slice(0, 8).toUpperCase()}` : undefined;
  return Promise.all(inputs.map((input) => createSampleRequest({ ...input, requestGroupId: groupId })));
}

export async function listSampleRequests(input: { offset?: number; limit?: number; q?: string; status?: string; pic?: string; year?: string } = {}) {
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.min(50, Math.max(1, input.limit ?? 50));
  const q = (input.q ?? "").trim().toLowerCase();
  const hasFilters = Boolean(q || input.status || input.pic || input.year);
  if (!hasFilters) {
    const [ids, total] = await Promise.all([
      redis<string[]>("ZREVRANGE", key("samples"), offset, offset + limit - 1),
      redis<number>("ZCARD", key("samples")),
    ]);
    return { items: await getJsonMany<SampleRequest>((ids ?? []).map((id) => key("sample", id))), total: Number(total ?? 0) };
  }
  const revision = await currentCollectionRevision("samples");
  const cacheKey = JSON.stringify({ q, status: input.status ?? "", pic: input.pic ?? "", year: input.year ?? "", revision });
  let filtered = requestFilterCache.get(cacheKey);
  if (!filtered) {
    const ids = await redis<string[]>("ZREVRANGE", key("samples"), 0, -1);
    const requests = await getJsonMany<SampleRequest>((ids ?? []).map((id) => key("sample", id)));
    filtered = requests.filter((item) => {
    const haystack = `${item.id} ${item.brand} ${item.username} ${item.picName ?? ""} ${item.status} ${item.trackingNumber ?? ""}`.toLowerCase();
    return (!q || haystack.includes(q))
      && (!input.status || item.status === input.status)
      && (!input.pic || item.picName === input.pic)
      && (!input.year || String(new Date(item.createdAt).getFullYear()) === input.year);
    });
    requestFilterCache.set(cacheKey, filtered);
  }
  return { items: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function listUserSampleRequests(userId: string, limit = 50) {
  const ids = await redis<string[]>("ZREVRANGE", key("user", userId, "samples"), 0, limit - 1);
  return getJsonMany<SampleRequest>((ids ?? []).map((id) => key("sample", id)));
}

export async function updateSampleRequest(id: string, input: { status: SampleStatus; trackingNumber?: string; adminNote?: string; picName?: string; picPhone?: string }) {
  return withRecordLock("sample", id, async (session) => {
    const request = await getJson<SampleRequest>(key("sample", id));
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.status !== input.status && !SAMPLE_STATUS_TRANSITIONS[request.status].includes(input.status)) throw new Error("INVALID_STATUS_TRANSITION");
    const updated = { ...request, ...input, updatedAt: new Date().toISOString() };
    await session.commit(async () => {
      await setJson(key("sample", id), updated);
      await bumpRequestRevision();
    });
    return updated;
  });
}
