"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationList({ notifications, hasUnread }: { notifications: NotificationRow[]; hasUnread: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function markOne(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  if (!notifications.length) {
    return (
      <div className="dashboard-empty">
        <b>Belum ada notifikasi.</b>
        <p>Update status sample dan campaign baru akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <>
      <div className="notification-toolbar">
        <button type="button" className="btn btn-ghost" disabled={!hasUnread || pending} onClick={markAll}>
          Tandai semua dibaca
        </button>
      </div>

      <ul className="notification-list">
        {notifications.map((item) => {
          const unread = item.readAt === null;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`notification-item${unread ? " unread" : ""}`}
                disabled={pending || !unread}
                aria-label={unread ? `Tandai "${item.title}" sebagai dibaca` : item.title}
                onClick={() => markOne(item.id)}
              >
                <span className="notification-dot" aria-hidden="true" />
                <span className="notification-body">
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                  <time dateTime={item.createdAt}>{formatCreatedAt(item.createdAt)}</time>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
