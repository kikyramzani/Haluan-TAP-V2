import Link from "next/link";
import { prisma } from "../../../lib/db";
import Icon from "../../components/Icon";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function AdminRingkasanPage({ searchParams }: Props) {
  /**
   * /admin/pengguna, /admin/audit, dan /admin/import memantulkan admin biasa ke
   * sini dengan ?error=forbidden — dan sampai sekarang halaman ini tidak pernah
   * membaca searchParams sama sekali. Admin yang mengetik salah satu URL itu
   * mendarat di ringkasan tanpa satu pun penjelasan kenapa.
   */
  const forbidden = (await searchParams).error === "forbidden";

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

      {forbidden ? (
        <p className="admin-notice" role="alert">
          Halaman itu khusus Super Admin. Minta Super Admin untuk membukanya kalau kamu memang perlu akses.
        </p>
      ) : null}

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
        Lihat analitik klik dan funnel campaign <Icon name="arrow-up-right" />
      </Link>
    </>
  );
}
