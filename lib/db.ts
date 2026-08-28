import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Postgres client singleton (Vercel Postgres + Prisma, via the `pg` driver
 * adapter — Prisma 7 no longer takes a connection string from schema.prisma
 * for the runtime client, only through an adapter passed here).
 *
 * This is additive infrastructure: nothing in the app reads or writes
 * through this client yet. Each phase in
 * /Users/macbook/.claude/plans/kamu-lihat-dari-bagian-purrfect-hopcroft.md
 * repoints one Redis-backed read/write path at Prisma at a time.
 *
 * The global-cache guard avoids exhausting Postgres connections from
 * Next.js dev's module hot-reload, which would otherwise construct a new
 * PrismaClient (and connection pool) on every edit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.POSTGRES_PRISMA_URL;
  if (!connectionString) throw new Error("TAP_DATASTORE_UNAVAILABLE");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function dbReady() {
  return Boolean(process.env.POSTGRES_PRISMA_URL);
}
