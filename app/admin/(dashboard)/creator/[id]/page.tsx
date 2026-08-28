import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { recordAudit } from "../../../../../lib/audit";
import CreatorMembershipActions from "./CreatorMembershipActions";

const MEMBERSHIP_LABEL: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
  SUSPENDED: "Ditangguhkan",
};

const SAMPLE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Diajukan",
  APPROVED: "Disetujui",
  SHIPPED: "Dikirim",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function AdminCreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;

  const creator = await prisma.creator.findUnique({
    where: { id },
    include: {
      user: true,
      address: { include: { province: true, regency: true, district: true, village: true } },
      sampleRequests: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { campaign: { include: { brand: true } } },
      },
    },
  });
  if (!creator) notFound();

  // Every time a creator's detail page is opened, opening their address is
  // itself an audited action — deliberately separate from editing it.
  await recordAudit({ actorId: admin.id, action: "creator_address.view", targetId: creator.id });

  const address = creator.address;
  const hasStructuredAddress = Boolean(address?.provinceId || address?.regencyId || address?.districtId || address?.villageId);

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>KREATOR</span>
          <h1>{creator.user.name}</h1>
        </div>
        <Link className="btn btn-ghost" href="/admin/creator">
          ← Kembali
        </Link>
      </div>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>DATA PRIBADI</span>
            <h2>Informasi akun</h2>
          </div>
          <span className={`admin-status membership-${creator.membership.toLowerCase()}`}>{MEMBERSHIP_LABEL[creator.membership]}</span>
        </div>
        <div className="two-col">
          <p>
            <b>Nama</b>
            <br />
            {creator.user.name}
          </p>
          <p>
            <b>Email</b>
            <br />
            {creator.user.email}
          </p>
          <p>
            <b>Telepon</b>
            <br />
            {creator.user.phone ?? "—"}
          </p>
          <p>
            <b>Provider</b>
            <br />
            {creator.user.provider}
          </p>
          <p>
            <b>Email terverifikasi</b>
            <br />
            {formatDate(creator.user.emailVerifiedAt)}
          </p>
          <p>
            <b>Sumber verifikasi</b>
            <br />
            {creator.user.verificationSource ?? "—"}
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>AKUN SOSIAL</span>
            <h2>TikTok / Shopee</h2>
          </div>
        </div>
        <div className="two-col">
          <p>
            <b>TikTok</b>
            <br />
            {creator.tiktokUsername ? `@${creator.tiktokUsername}` : "—"}
          </p>
          <p>
            <b>Shopee</b>
            <br />
            {creator.shopeeUsername ? `@${creator.shopeeUsername}` : "—"}
          </p>
          <p>
            <b>Niche</b>
            <br />
            {creator.niche ?? "—"}
          </p>
          <p>
            <b>Followers</b>
            <br />
            {creator.followers ?? "—"}
          </p>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>ALAMAT PENGIRIMAN</span>
            <h2>Alamat kreator</h2>
          </div>
        </div>
        {!address ? (
          <p className="admin-panel-empty">Belum ada alamat.</p>
        ) : hasStructuredAddress ? (
          <div className="two-col">
            <p>
              <b>Penerima</b>
              <br />
              {address.recipientName ?? "—"} · {address.recipientPhone ?? "—"}
            </p>
            <p>
              <b>Detail alamat</b>
              <br />
              {address.detailAddress ?? "—"}
            </p>
            <p>
              <b>Wilayah</b>
              <br />
              {[address.village?.name, address.district?.name, address.regency?.name, address.province?.name].filter(Boolean).join(", ") || "—"}
            </p>
            <p>
              <b>RT/RW</b>
              <br />
              {address.rt ?? "—"}/{address.rw ?? "—"}
            </p>
            <p>
              <b>Kode pos</b>
              <br />
              {address.postalCode ?? "—"}
            </p>
          </div>
        ) : (
          <p>{address.legacyAddressText ?? "Belum ada alamat."}</p>
        )}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <span>SAMPLE REQUEST</span>
            <h2>5 request terakhir</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Status</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {creator.sampleRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.campaign?.brand.displayName ?? request.brandNameSnapshot}</td>
                  <td>
                    <span className={`admin-status status-${request.status.toLowerCase()}`}>{SAMPLE_STATUS_LABEL[request.status]}</span>
                  </td>
                  <td>{formatDate(request.createdAt)}</td>
                </tr>
              ))}
              {!creator.sampleRequests.length ? (
                <tr>
                  <td colSpan={3} className="empty-cell">
                    Belum ada request sample.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <CreatorMembershipActions creatorId={creator.id} membership={creator.membership} />
    </>
  );
}
