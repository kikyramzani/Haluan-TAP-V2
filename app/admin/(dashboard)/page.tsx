import Link from "next/link";
import { prisma } from "../../../lib/db";

export default async function AdminRingkasanPage() {
  const [brandCount, campaignCount, sampleWaiting, creatorWaiting] = await Promise.all([
    prisma.brand.count({ where: { hidden: false } }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.sampleRequest.count({ where: { status: "PENDING" } }),
    prisma.creator.count({ where: { membership: "PENDING" } }),
  ]);

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>RINGKASAN</span>
          <h1>Halo, Admin</h1>
        </div>
      </div>

      <section className="admin-stats">
        <article>
          <span>Brand aktif</span>
          <strong>{brandCount}</strong>
        </article>
        <article>
          <span>Campaign aktif</span>
          <strong>{campaignCount}</strong>
        </article>
        <article>
          <span>Sample menunggu</span>
          <strong>{sampleWaiting}</strong>
        </article>
        <article>
          <span>Creator menunggu verifikasi</span>
          <strong>{creatorWaiting}</strong>
        </article>
      </section>

      <Link className="btn btn-secondary" href="/admin/analitik">
        Lihat analitik klik dan funnel campaign ↗
      </Link>
    </>
  );
}
