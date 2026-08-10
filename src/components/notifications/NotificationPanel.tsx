'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  notificationsApi,
  type NotificationDTO,
} from '@/client/api/notifications.api';

const displayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
  }).format(date);
};

export default function NotificationPanel() {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void notificationsApi
      .list(controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setUnreadCount(page.unreadCount);
        setLoadFailed(false);
        setLoaded(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => controller.abort();
  }, [loadAttempt]);

  const retryLoad = (): void => {
    setLoaded(false);
    setLoadFailed(false);
    setLoadAttempt((current) => current + 1);
  };

  const markRead = (notification: NotificationDTO): void => {
    if (notification.isRead) return;
    setItems((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    void notificationsApi.markRead(notification.id).catch(() => {
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, isRead: false } : item
        )
      );
      setUnreadCount((current) => current + 1);
    });
  };

  if (!loaded) return null;

  if (loadFailed) {
    return (
      <section
        className="app-panel app-panel-solid mt-4 p-5 sm:p-6"
        aria-label="Уведомления"
      >
        <h2 className="text-lg font-semibold">Уведомления</h2>
        <p className="app-muted mt-2 text-sm">Не удалось загрузить уведомления.</p>
        <button className="app-btn-secondary mt-3" type="button" onClick={retryLoad}>
          Повторить
        </button>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section
      className="app-panel app-panel-solid mt-4 p-5 sm:p-6"
      aria-label="Уведомления"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Уведомления</h2>
        {unreadCount > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
            Новых: {unreadCount}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((notification) => (
          <article
            key={notification.id}
            className={`rounded-xl border p-3 ${
              notification.isRead
                ? 'border-slate-100 bg-white'
                : 'border-indigo-100 bg-indigo-50/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{notification.title}</h3>
                <p className="app-muted mt-1 text-sm">{notification.message}</p>
              </div>
              <time
                className="app-muted shrink-0 text-xs"
                dateTime={notification.createdAt}
              >
                {displayDate(notification.createdAt)}
              </time>
            </div>
            <Link
              href={notification.action.href}
              className="app-btn-secondary mt-3 inline-flex px-3 py-1.5 text-xs"
              onClick={() => markRead(notification)}
            >
              {notification.action.label}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
