import { key, redis } from "./redis.ts";

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 32;

/**
 * Short-lived memo for filtered admin listings. Entries are swept on write, so a
 * long-running instance cannot accumulate creator records it no longer serves.
 */
export function createFilterCache<T>(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
  const entries = new Map<string, { expiresAt: number; value: T }>();
  return {
    get(cacheKey: string, now = Date.now()) {
      const entry = entries.get(cacheKey);
      if (!entry) return null;
      if (entry.expiresAt <= now) {
        entries.delete(cacheKey);
        return null;
      }
      return entry.value;
    },
    set(cacheKey: string, value: T, now = Date.now()) {
      for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(cacheKey, { expiresAt: now + ttlMs, value });
      return value;
    },
    clear() { entries.clear(); },
    get size() { return entries.size; },
  };
}

/**
 * Two signals, because each one alone has a blind spot: the counter catches
 * in-app edits made on any instance — including edits that leave the collection
 * size unchanged, such as a sample status change — and the cardinality catches
 * writes that bypass the app entirely (migration scripts, manual repairs).
 */
export async function bumpCollectionRevision(scope: string) {
  try { await redis("INCR", key(scope, "revision")); }
  catch { /* Cache freshness must never fail the write it follows. */ }
}

export async function currentCollectionRevision(scope: string) {
  try {
    const [revision, size] = await Promise.all([
      redis<string | number | null>("GET", key(scope, "revision")),
      redis<number>("ZCARD", key(scope)),
    ]);
    return `${Number(revision ?? 0)}:${Number(size ?? 0)}`;
  } catch { return `uncached:${Date.now()}`; }
}
