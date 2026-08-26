import { randomBytes } from "node:crypto";
import { key, redis } from "./redis.ts";
import { renewIfEquals, tryDeleteIfEquals } from "./atomic.ts";

const LOCK_TTL_MS = 10_000;
const ACQUIRE_ATTEMPTS = 4;
const RETRY_DELAY_MS = 70;

export class MutationConflictError extends Error {
  constructor(scope: string, id: string) {
    super(`MUTATION_CONFLICT:${scope}:${id}`);
    this.name = "MutationConflictError";
  }
}

export type MutationSession = {
  /** Key and token of the held lease, for mutations that commit inside a script. */
  lockKey: string;
  lockToken: string;
  /**
   * Runs the final write of a critical section. Ownership is re-checked and the
   * lease extended in one atomic step first, so a holder whose lease already
   * moved on aborts instead of overwriting its successor. Writers must place
   * every persisted change inside `commit`, which is why the lock exposes no
   * bare guard: a guard you have to remember to call is a guard that gets
   * forgotten.
   */
  commit: <T>(write: () => Promise<T>) => Promise<T>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every writer of a record takes the same lock and re-reads inside it. Without
 * that, two requests read the same version, each writes the whole record back,
 * and the slower write silently erases the faster one — including the index
 * bookkeeping that was based on the version it read.
 */
export async function withRecordLock<T>(scope: string, id: string, run: (session: MutationSession) => Promise<T>): Promise<T> {
  const lockKey = key("lock", scope, id);
  const lockToken = randomBytes(16).toString("base64url");
  let held = false;
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS && !held; attempt += 1) {
    held = Boolean(await redis<number | null>("SET", lockKey, lockToken, "NX", "PX", LOCK_TTL_MS));
    if (!held) await wait(RETRY_DELAY_MS);
  }
  if (!held) throw new MutationConflictError(scope, id);

  const session: MutationSession = {
    lockKey,
    lockToken,
    commit: async (write) => {
      if (!(await renewIfEquals(lockKey, lockToken, LOCK_TTL_MS))) throw new MutationConflictError(scope, id);
      return write();
    },
  };

  try {
    return await run(session);
  } finally {
    await tryDeleteIfEquals(lockKey, lockToken);
  }
}

export function isMutationConflict(error: unknown) {
  return error instanceof Error && error.name === "MutationConflictError";
}
