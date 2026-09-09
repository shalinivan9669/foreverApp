import { http } from '@/client/api/http';

export type NotificationType =
  | 'PAIR_JOINED'
  | 'CYCLE_AVAILABLE'
  | 'SUMMARY_READY'
  | 'ACTION_AVAILABLE'
  | 'FEEDBACK_REQUESTED'
  | 'MATCH_LIKE_RECEIVED'
  | 'MATCH_LIKE_RESPONDED'
  | 'MATCH_CONNECTED'
  | 'MATCH_CONFIRMATION_REQUESTED';

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  action: {
    label: string;
    href: string;
  };
  isRead: boolean;
  createdAt: string;
};

export type NotificationPageDTO = {
  items: NotificationDTO[];
  nextCursor?: string;
  unreadCount: number;
};

export const notificationsApi = {
  list(signal?: AbortSignal, cursor?: string): Promise<NotificationPageDTO> {
    const query = new URLSearchParams({ limit: '5' });
    if (cursor) query.set('cursor', cursor);
    return http.get<NotificationPageDTO>(`/api/notifications?${query}`, {
      signal,
      cache: 'no-store',
    });
  },

  markRead(id: string): Promise<NotificationDTO> {
    return http.post<NotificationDTO, Record<string, never>>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      {}
    );
  },
};
