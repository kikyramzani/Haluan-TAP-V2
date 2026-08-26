import { cleanupExpiredPendingUsers, reconcileChallengeSettlements, reconcileStalePhoneClaims } from "../../../../lib/auth";
import { recordAudit } from "../../../../lib/audit";
import { recordCronRun } from "../../../../lib/cron-status";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Akses ditolak." }, { status: 401 });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const removed = await cleanupExpiredPendingUsers();
    const phoneClaims = await reconcileStalePhoneClaims();
    // Housekeeping that a landed commit could not finish is retried here rather
    // than left for the next person to trip over.
    const settlements = await reconcileChallengeSettlements();
    await recordCronRun({ job: "cleanup-users", status: "succeeded", startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, removed, phoneClaimsRepaired: phoneClaims.repaired, phoneClaimsContended: phoneClaims.contended, settlementsSettled: settlements.settled, settlementsPending: settlements.pending });
    try {
      await recordAudit({ actorId: "system:cron", action: "users.cleanup", targetId: "pending-users", after: { removed, phoneClaimsRepaired: phoneClaims.repaired, phoneClaimsContended: phoneClaims.contended, settlementsSettled: settlements.settled, settlementsPending: settlements.pending, durationMs: Date.now() - started } });
    } catch { /* Cleanup already succeeded; the trail must not undo it. */ }
    return Response.json({ removed, phoneClaimsRepaired: phoneClaims.repaired, phoneClaimsContended: phoneClaims.contended, settlementsSettled: settlements.settled, settlementsPending: settlements.pending });
  } catch (error) {
    // A failed sweep must be as visible as a successful one.
    await recordCronRun({
      job: "cleanup-users",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return Response.json({ error: "Pembersihan gagal." }, { status: 500 });
  }
}
