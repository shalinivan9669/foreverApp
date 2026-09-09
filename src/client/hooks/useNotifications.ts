'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type NotificationDTO } from '@/client/api/notifications.api';
import { isApiClientError } from '@/client/api/errors';

type NotificationState = {
  items: NotificationDTO[];
  unreadCount: number;
  nextCursor?: string;
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadFailed: boolean;
  moreFailed: boolean;
  readFailed: boolean;
};

const INITIAL_STATE: NotificationState = {
  items: [], unreadCount: 0, loaded: false, loading: false,
  loadingMore: false, loadFailed: false, moreFailed: false, readFailed: false,
};

export function useNotifications() {
  const [state, setState] = useState(INITIAL_STATE);
  const current = useRef(INITIAL_STATE);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const pendingReads = useRef(new Map<string, Promise<void>>());
  const readRevision = useRef(0);

  const update = useCallback((change: (previous: NotificationState) => NotificationState) => {
    if (!active.current) return;
    current.current = change(current.current);
    setState(current.current);
  }, []);

  const load = useCallback(async (cursor?: string) => {
    if (!active.current || (cursor && request.current)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => active.current && request.current === controller && !controller.signal.aborted;
    update((previous) => ({
      ...previous, loading: !cursor, loadingMore: Boolean(cursor),
      loadFailed: false, moreFailed: false,
    }));
    try {
      // The endpoint returns one total unread count for all pages. A list read
      // overlapping a mark-read may contain an older count or older item state.
      // Retry that same page after mutations settle instead of guessing a delta.
      while (isCurrent()) {
        await Promise.all([...pendingReads.current.values()]);
        if (!isCurrent()) return;
        const revision = readRevision.current;
        const page = await notificationsApi.list(controller.signal, cursor);
        if (!isCurrent()) return;
        if (revision !== readRevision.current) continue;
        update((previous) => {
          const items = new Map((cursor ? previous.items : []).map((item) => [item.id, item]));
          for (const item of page.items) items.set(item.id, item);
          return {
            ...previous, items: [...items.values()], nextCursor: page.nextCursor,
            unreadCount: page.unreadCount, loaded: true, readFailed: false,
          };
        });
        return;
      }
    } catch (error) {
      if (!isCurrent()) return;
      const accessLost = error instanceof Error && isApiClientError(error) && [401, 403, 404].includes(error.status);
      update((previous) => ({
        ...(accessLost ? INITIAL_STATE : previous), loaded: true,
        loadFailed: accessLost || !cursor, moreFailed: !accessLost && Boolean(cursor),
      }));
    } finally {
      if (isCurrent()) {
        request.current = null;
        update((previous) => ({ ...previous, loading: false, loadingMore: false }));
      }
    }
  }, [update]);

  const refresh = useCallback(() => load(), [load]);
  const loadMore = useCallback(async () => {
    if (current.current.nextCursor) await load(current.current.nextCursor);
  }, [load]);

  const markRead = useCallback((notification: NotificationDTO): void => {
    const item = current.current.items.find((entry) => entry.id === notification.id);
    if (!active.current || !item || item.isRead || pendingReads.current.has(item.id)) return;
    readRevision.current += 1;
    update((previous) => ({ ...previous, readFailed: false }));
    const operation = (async () => {
      try {
        const result = await notificationsApi.markRead(item.id);
        update((previous) => ({
          ...previous,
          unreadCount: previous.items.some((entry) => entry.id === item.id && !entry.isRead)
            ? Math.max(0, previous.unreadCount - 1) : previous.unreadCount,
          items: previous.items.map((entry) => entry.id === item.id ? result : entry),
        }));
      } catch {
        update((previous) => ({ ...previous, readFailed: true }));
      } finally {
        readRevision.current += 1;
        pendingReads.current.delete(item.id);
      }
    })();
    pendingReads.current.set(item.id, operation);
  }, [update]);

  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  return { ...state, refresh, loadMore, markRead };
}
