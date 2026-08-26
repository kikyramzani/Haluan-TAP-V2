import { getJson, key, setJson } from "./redis.ts";

export type CronRun = {
  job: string;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  removed?: number;
  phoneClaimsRepaired?: number;
  phoneClaimsContended?: number;
  settlementsSettled?: number;
  settlementsPending?: number;
  error?: string;
};

const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/**
 * A job that only leaves a trail when it succeeds cannot be told apart from a
 * job that never ran. The heartbeat is written on both outcomes and read from a
 * fixed key, so the admin view never depends on scanning recent audit events.
 */
export async function recordCronRun(run: CronRun) {
  try { await setJson(key("cron", run.job), run); }
  catch { /* The work itself already happened; reporting must not undo it. */ }
}

export async function readCronRun(job: string) {
  try {
    const run = await getJson<CronRun>(key("cron", job));
    if (!run) return null;
    return { ...run, stale: Date.now() - Date.parse(run.finishedAt) > STALE_AFTER_MS };
  } catch { return null; }
}
