import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { listUserSampleRequests } from "../../../lib/requests";
import { STATUS_LABELS, formatDate } from "../../admin/(dashboard)/sample/labels";
import CancelSampleForm from "./CancelSampleForm";
import Icon from "../../components/Icon";

type HappyPathStatus = "PENDING" | "APPROVED" | "SHIPPED" | "COMPLETED";

/**
 * PENDING → APPROVED → SHIPPED → COMPLETED is the happy path, rendered as a
 * single linear stepper. REJECTED/CANCELLED are deliberately NOT points on
 * this line — they are separate branch states, rendered as their own note
 * instead of a stepper that looks like it "reached" some step and stopped.
 */
const HAPPY_PATH: Array<{ status: HappyPathStatus; label: string }> = [
  { status: "PENDING", label: "Diajukan" },
  { status: "APPROVED", label: "Disetujui" },
  { status: "SHIPPED", label: "Dikirim" },
  { status: "COMPLETED", label: "Selesai" },
];

function stepDateFor(status: HappyPathStatus, request: { requestedAt: Date; approvedAt: Date | null; shippedAt: Date | null; completedAt: Date | null }): Date | null {
  if (status === "PENDING") return request.requestedAt;
  if (status === "APPROVED") return request.approvedAt;
  if (status === "SHIPPED") return request.shippedAt;
  return request.completedAt;
}

export default async function SampleRequestsPage() {
  const user = await requireUser("/dashboard/sample");
  const requests = await listUserSampleRequests(user.id);

  return (
    <section className="dashboard-section">
      <div className="dashboard-title">
        <div>
          <span>SAMPLE</span>
          <h1>Request sample kamu</h1>
        </div>
        <Link href="/request-sample">Request sample baru <Icon name="arrow-up-right" /></Link>
      </div>

      {requests.length === 0 ? (
        <div className="dashboard-empty">
          <b>Belum ada request sample.</b>
          <p>Ajukan sample dari campaign yang membuka kuota untuk mulai membuat konten.</p>
          <Link href="/request-sample">Request sample <Icon name="arrow-right" /></Link>
        </div>
      ) : (
        <div className="sample-request-list">
          {requests.map((request) => {
            const brandName = request.campaign?.brand.displayName ?? request.brandNameSnapshot;
            const isBranch = request.status === "REJECTED" || request.status === "CANCELLED";
            const currentIndex = HAPPY_PATH.findIndex((step) => step.status === request.status);
            const showShipping = request.status === "SHIPPED" || request.status === "COMPLETED";

            return (
              <article key={request.id} className="sample-request-card admin-panel">
                <header className="panel-heading">
                  <div>
                    <span>{formatDate(request.requestedAt)}</span>
                    <h3>{brandName}</h3>
                  </div>
                  <span className={`admin-status status-${request.status.toLowerCase()}`}>{STATUS_LABELS[request.status]}</span>
                </header>

                {isBranch ? (
                  <div className={`sample-branch-note ${request.status === "REJECTED" ? "branch-rejected" : "branch-cancelled"}`}>
                    {request.status === "REJECTED" ? (
                      <p>
                        Request ini ditolak tim Haluan{request.rejectionReason ? `: ${request.rejectionReason}` : "."}
                      </p>
                    ) : (
                      <p>Request ini dibatalkan{request.cancelledAt ? ` pada ${formatDate(request.cancelledAt)}` : "."}</p>
                    )}
                  </div>
                ) : (
                  <ol className="timeline sample-progress">
                    {HAPPY_PATH.map((step, index) => {
                      const state = index < currentIndex ? "step-done" : index === currentIndex ? "step-current" : "step-upcoming";
                      const date = stepDateFor(step.status, request);
                      return (
                        <li key={step.status} className={state}>
                          <b>{step.label}</b>
                          {date ? <span className="timeline-meta">{formatDate(date)}</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {showShipping ? (
                  <p className="sample-shipping-meta">
                    Kurir: {request.carrier || "—"} · Resi: {request.trackingNumber || "—"}
                  </p>
                ) : null}

                {request.status === "PENDING" ? <CancelSampleForm requestId={request.id} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
