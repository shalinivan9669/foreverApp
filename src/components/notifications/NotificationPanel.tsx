'use client';

import Link from 'next/link';
import { useRefreshOnReturn } from '@/client/hooks/useRefreshOnReturn';
import { useNotifications } from '@/client/hooks/useNotifications';

const displayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
  }).format(date);
};

type NotificationPanelProps = {
  enabled?: boolean;
};

export default function NotificationPanel({ enabled = true }: NotificationPanelProps) {
  return enabled ? <NotificationPanelSession /> : null;
}

function NotificationPanelSession() {
  const { items, unreadCount, nextCursor, loaded, loading, loadingMore,
    loadFailed, moreFailed, readFailed, refresh, loadMore, markRead } = useNotifications();
  useRefreshOnReturn(refresh, !loading && !loadingMore);

  if (!loaded) return null;

  if (loadFailed && items.length === 0) {
    return (
      <section
        className="app-panel app-panel-solid mt-4 p-5 sm:p-6"
        aria-label="Уведомления"
      >
        <h2 className="text-lg font-semibold">Уведомления</h2>
        <p className="app-muted mt-2 text-sm">Не удалось загрузить уведомления.</p>
        <button className="app-btn-secondary mt-3" type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? 'Загружаем…' : 'Повторить'}
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
      <button type="button" className="app-btn-secondary mt-3 px-3 py-2 text-sm" disabled={loading} onClick={() => void refresh()}>
        {loading ? 'Обновляем…' : 'Обновить уведомления'}
      </button>
      {loadFailed && <p role="status" className="app-muted mt-2 text-sm">Не удалось обновить уведомления. Сохранённый список остаётся доступен; повторите обновление.</p>}
      <div className="mt-3 grid gap-2">
        {readFailed && <p role="status" className="app-muted text-sm">Переход доступен, но отметку прочтения сохранить не удалось. Состояние обновится при возвращении.</p>}
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
      {moreFailed && <p role="status" className="app-muted mt-3 text-sm">Не удалось загрузить более ранние уведомления. Уже загруженные записи сохранены.</p>}
      {nextCursor && <button type="button" className="app-btn-secondary mt-3 px-3 py-2 text-sm" disabled={loading || loadingMore} onClick={() => void loadMore()}>
        {loadingMore ? 'Загружаем…' : moreFailed ? 'Повторить загрузку' : 'Показать ещё'}
      </button>}
      <p className="app-muted mt-2 text-xs" role="status">Показано уведомлений: {items.length}{nextCursor ? '. Более ранние доступны по кнопке выше.' : '. Все доступные уведомления загружены.'}</p>
    </section>
  );
}
