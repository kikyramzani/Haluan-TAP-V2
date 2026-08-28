import { prisma } from "./db.ts";
import type { Prisma } from "@prisma/client";

export type CronRun = {
  job: string;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  removed?: number;
  expiredSessionsRemoved?: number;
  error?: string;
  /** Job-specific counters that don't warrant their own named field (e.g. campaignsExpired, statsRecomputed). */
  details?: Record<string, number>;
};

const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/**
 * A job that only leaves a trail when it succeeds cannot be told apart from a
 * job that never ran. The heartbeat is upserted on both outcomes, one row per
 * job, so the admin view never depends on scanning recent audit events.
 */
export async function recordCronRun(run: CronRun) {
  try {
    const data = {
      status: run.status,
      startedAt: new Date(run.startedAt),
      finishedAt: new Date(run.finishedAt),
      durationMs: run.durationMs,
      removed: run.removed,
      expiredSessionsRemoved: run.expiredSessionsRemoved,
      error: run.error,
      details: run.details as Prisma.InputJsonValue | undefined,
    };
    await prisma.cronRun.upsert({ where: { job: run.job }, create: { job: run.job, ...data }, update: data });
  } catch { /* The work itself already happened; reporting must not undo it. */ }
}

export async function readCronRun(job: string) {
  try {
    const row = await prisma.cronRun.findUnique({ where: { job } });
    if (!row) return null;
    return { ...row, stale: Date.now() - row.finishedAt.getTime() > STALE_AFTER_MS };
  } catch { return null; }
}
