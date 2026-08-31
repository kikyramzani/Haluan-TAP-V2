import Link from "next/link";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import NotificationList from "./NotificationList";
import PushToggle from "./PushToggle";
import Icon from "../../components/Icon";

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<{ page?: string }> };

export default async function NotifikasiPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard/notifikasi");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const notifications = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }));

  return (
    <>
      <div className="panel-heading">
        <div>
          <span>WORKSPACE</span>
          <h1>Notifikasi</h1>
        </div>
      </div>

      <PushToggle />

      <section className="dashboard-section">
        <div className="dashboard-title">
          <div>
            <span>{unreadCount > 0 ? `${unreadCount} BELUM DIBACA` : "SEMUA SUDAH DIBACA"}</span>
            <h2>Aktivitas akunmu</h2>
          </div>
        </div>

        <NotificationList notifications={notifications} hasUnread={unreadCount > 0} />

        {total > 0 ? (
          <div className="admin-pagination">
            <Link aria-disabled={page <= 1} href={`/dashboard/notifikasi?page=${page - 1}`}>
              <Icon name="arrow-left" /> Sebelumnya
            </Link>
            <span>
              Halaman {page} dari {totalPages} · {total} notifikasi
            </span>
            <Link aria-disabled={page >= totalPages} href={`/dashboard/notifikasi?page=${page + 1}`}>
              Berikutnya <Icon name="arrow-right" />
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
