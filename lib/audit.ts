import { Prisma } from "@prisma/client";
import { prisma } from "./db.ts";

export type AuditEvent = {
  id: string;
  actorId: string;
  /** Email of the actor, when actorId resolves to a real User. Undefined for system/anonymous entries. */
  actorEmail?: string | null;
  action: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
};

export async function recordAudit(input: { actorId: string; action: string; targetId: string; before?: unknown; after?: unknown }) {
  const event = await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
    },
  });
  return toAuditEvent(event);
}

type AuditEventRow = {
  id: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
  actor?: { email: string } | null;
};

/**
 * Two call shapes, kept for backward compatibility with existing callers
 * (e.g. app/api/admin/audits/route.ts, which expects a plain array back):
 * - `listAuditEvents(limit?)` returns `AuditEvent[]`, newest first.
 * - `listAuditEvents({ q, limit, offset })` returns `{ items, total }` for a
 *   searchable, paginated view (used by app/admin/audit).
 */
export async function listAuditEvents(limit?: number): Promise<AuditEvent[]>;
export async function listAuditEvents(input: { q?: string; limit?: number; offset?: number }): Promise<{ items: AuditEvent[]; total: number }>;
export async function listAuditEvents(
  input?: number | { q?: string; limit?: number; offset?: number },
): Promise<AuditEvent[] | { items: AuditEvent[]; total: number }> {
  if (typeof input !== "object" || input === null) {
    const limit = Math.max(0, Math.min(input ?? 100, 250));
    const events = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { email: true } } },
    });
    return events.map(toAuditEvent);
  }

  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));
  const offset = Math.max(0, input.offset ?? 0);
  const q = (input.q ?? "").trim();
  const where: Prisma.AuditLogWhereInput = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { targetId: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [events, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: { actor: { select: { email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: events.map(toAuditEvent), total };
}

function toAuditEvent(event: AuditEventRow): AuditEvent {
  return {
    id: event.id,
    actorId: event.actorId ?? "",
    actorEmail: event.actor?.email ?? null,
    action: event.action,
    targetId: event.targetId ?? "",
    before: event.before ?? undefined,
    after: event.after ?? undefined,
    createdAt: event.createdAt.toISOString(),
  };
}
