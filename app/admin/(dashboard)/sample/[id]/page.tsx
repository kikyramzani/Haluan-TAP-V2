import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../../lib/db";
import { STATUS_LABELS, formatDate } from "../labels";
import SampleActionForms from "../SampleActionForms";
import Icon from "../../../../components/Icon";

type Props = { params: Promise<{ id: string }> };

/**
 * addressSnapshot is a raw JSON copy of the CreatorAddress row taken at
 * approval time (see lib/requests.ts's updateSampleRequest). It only holds
 * the wilayah foreign keys, not the human-readable names, so this page
 * resolves them separately below rather than dumping the raw JSON.
 */
type AddressSnapshot = {
  provinceId?: string | null;
  regencyId?: string | null;
  districtId?: string | null;
  villageId?: string | null;
  rt?: string | null;
  rw?: string | null;
  postalCode?: string | null;
  detailAddress?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  legacyAddressText?: string | null;
};

export default async function AdminSampleDetailPage({ params }: Props) {
  const { id } = await params;

  const request = await prisma.sampleRequest.findUnique({
    where: { id },
    include: {
      creator: { include: { user: { select: { id: true, name: true, email: true } } } },
      campaign: { include: { brand: true } },
    },
  });
  if (!request) notFound();

  const snapshot = (request.addressSnapshot as AddressSnapshot | null) ?? null;
  const [province, regency, district, village] = snapshot
    ? await Promise.all([
        snapshot.provinceId ? prisma.province.findUnique({ where: { id: snapshot.provinceId }, select: { name: true } }) : null,
        snapshot.regencyId ? prisma.regency.findUnique({ where: { id: snapshot.regencyId }, select: { name: true } }) : null,
        snapshot.districtId ? prisma.district.findUnique({ where: { id: snapshot.districtId }, select: { name: true } }) : null,
        snapshot.villageId ? prisma.village.findUnique({ where: { id: snapshot.villageId }, select: { name: true } }) : null,
      ])
    : [null, null, null, null];

  const hasStructuredAddress = Boolean(snapshot && (snapshot.detailAddress || village || district || regency || province));
  const brandName = request.campaign?.brand.displayName ?? request.brandNameSnapshot;

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>SAMPLE</span>
          <h1>{brandName}</h1>
        </div>
        <Link className="btn btn-ghost" href="/admin/sample">
          <Icon name="arrow-left" /> Kembali
        </Link>
      </div>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>STATUS</span>
            <h2>{STATUS_LABELS[request.status]}</h2>
          </div>
          <span className={`admin-status status-${request.status.toLowerCase()}`}>{STATUS_LABELS[request.status]}</span>
        </div>
        <div className="admin-lifecycle">
          <p>Diajukan: {formatDate(request.requestedAt)}</p>
          {request.approvedAt ? <p>Disetujui: {formatDate(request.approvedAt)}</p> : null}
          {request.shippedAt ? <p>Dikirim: {formatDate(request.shippedAt)}</p> : null}
          {request.completedAt ? <p>Selesai: {formatDate(request.completedAt)}</p> : null}
          {request.cancelledAt ? <p>Dibatalkan: {formatDate(request.cancelledAt)}</p> : null}
          {request.status === "REJECTED" ? <p>Alasan penolakan: {request.rejectionReason || "—"}</p> : null}
          {request.approveNote ? <p>Catatan persetujuan: {request.approveNote}</p> : null}
          {request.carrier || request.trackingNumber ? (
            <p>
              Kurir/resi: {request.carrier || "—"} · {request.trackingNumber || "—"}
            </p>
          ) : null}
        </div>
      </section>

      <SampleActionForms id={request.id} status={request.status} />

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>CREATOR</span>
            <h2>{request.creator.user.name}</h2>
          </div>
        </div>
        <div className="admin-lifecycle">
          <p>Email: {request.creator.user.email}</p>
          <p>Username: {request.username ? `@${request.username}` : "—"}</p>
          <p>
            Profil:{" "}
            {request.profileUrl ? (
              <a href={request.profileUrl} target="_blank" rel="noreferrer">
                {request.profileUrl}
              </a>
            ) : (
              "—"
            )}
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>CAMPAIGN</span>
            <h2>{brandName}</h2>
          </div>
        </div>
        {request.campaign ? (
          <div className="admin-lifecycle">
            <p>Platform: {request.campaign.platform === "SHOPEE_AFFILIATE" ? "Shopee" : "TikTok Shop"}</p>
            <p>Status campaign: {request.campaign.status}</p>
          </div>
        ) : (
          <p className="admin-panel-empty">Request ini tidak terhubung ke campaign aktif (data lama atau brand belum tercatat sebagai campaign).</p>
        )}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>ALAMAT PENGIRIMAN</span>
            <h2>Snapshot alamat</h2>
          </div>
        </div>
        {hasStructuredAddress && snapshot ? (
          <div className="admin-lifecycle">
            {snapshot.recipientName ? <p>Penerima: {snapshot.recipientName}</p> : null}
            {snapshot.recipientPhone ? <p>No. HP: {snapshot.recipientPhone}</p> : null}
            {snapshot.detailAddress ? <p>{snapshot.detailAddress}</p> : null}
            <p>
              {[village?.name, district?.name, regency?.name, province?.name].filter(Boolean).join(", ") || "—"}
            </p>
            {snapshot.rt || snapshot.rw ? (
              <p>
                RT/RW: {snapshot.rt || "—"}/{snapshot.rw || "—"}
              </p>
            ) : null}
            {snapshot.postalCode ? <p>Kode pos: {snapshot.postalCode}</p> : null}
          </div>
        ) : (
          <p className="admin-panel-empty">{snapshot?.legacyAddressText || request.legacyAddressText || "Alamat belum tersedia."}</p>
        )}
      </section>
    </>
  );
}
