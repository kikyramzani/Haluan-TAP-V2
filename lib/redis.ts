const PREFIX = "tap:v1";

function credentials() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("TAP_DATASTORE_UNAVAILABLE");
  return { url: url.replace(/\/$/, ""), token };
}

export function datastoreReady() {
  return Boolean(
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

export async function redis<T = unknown>(...args: Array<string | number>) {
  const { url, token } = credentials();
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const payload = (await response.json()) as { result?: T; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? `Redis ${response.status}`);
  return payload.result as T;
}

export const key = (...parts: string[]) => [PREFIX, ...parts].join(":");

export async function getJson<T>(storageKey: string): Promise<T | null> {
  const value = await redis<string | null>("GET", storageKey);
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) as T : value as T;
}

export async function getJsonMany<T>(storageKeys: string[], batchSize = 500) {
  const results: T[] = [];
  for (let start = 0; start < storageKeys.length; start += batchSize) {
    const batch = storageKeys.slice(start, start + batchSize);
    if (!batch.length) continue;
    const values = await redis<Array<string | T | null>>("MGET", ...batch);
    for (const value of values ?? []) {
      if (!value) continue;
      results.push(typeof value === "string" ? JSON.parse(value) as T : value);
    }
  }
  return results;
}

export async function setJson(storageKey: string, value: unknown, ttlSeconds?: number) {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) return redis("SET", storageKey, serialized, "EX", ttlSeconds);
  return redis("SET", storageKey, serialized);
}
