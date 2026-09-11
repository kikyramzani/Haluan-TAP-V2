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

/**
 * AuditLog.actorId adalah FOREIGN KEY ke User. Aktor semu — "system:allowlist"
 * di reconcileAdminRole(), "system:verify" di verifikasi email, dan
 * "system:cron" di keempat rute cron — bukan id user mana pun, jadi setiap
 * insert-nya melanggar FK dan dilempar, lalu ditelan try/catch pemanggilnya.
 *
 * Akibatnya AuditLog produksi TIDAK memuat satu pun jejak sistem: pencabutan
 * hak admin yang mematikan sesi orang tidak meninggalkan baris `admin.revoked`
 * sama sekali, padahal OPERATIONS-RUNBOOK menyuruh operator memakai baris itu
 * sebagai bukti saat insiden. Ditemukan justru ketika menelusuri kenapa akun
 * admin yang baru dibuat kehilangan aksesnya.
 *
 * Nama aktornya dipindah ke `after` — yang memang sudah dirender utuh sebagai
 * JSON di /admin/audit — dan actorId dikosongkan supaya barisnya benar-benar
 * tersimpan. Halaman auditnya sudah menampilkan "Sistem" untuk actorId kosong.
 * Kolom khusus memang lebih rapi, tapi menuntut migrasi untuk sesuatu yang
 * harus berlaku hari ini juga.
 */
function splitSystemActor(input: { actorId: string; after?: unknown }): { actorId: string | null; after: unknown } {
  if (!input.actorId.startsWith("system:")) return { actorId: input.actorId, after: input.after };
  const after = input.after && typeof input.after === "object" ? { ...(input.after as object) } : {};
  return { actorId: null, after: { ...after, systemActor: input.actorId } };
}

export async function recordAudit(input: { actorId: string; action: string; targetId: string; before?: unknown; after?: unknown }) {
  const actor = splitSystemActor(input);
  const event = await prisma.auditLog.create({
    data: {
      actorId: actor.actorId,
      action: input.action,
      targetId: input.targetId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: actor.after === undefined ? undefined : (actor.after as object),
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
