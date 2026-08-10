import { http } from '@/client/api/http';

export type NotificationType =
  | 'PAIR_JOINED'
  | 'CYCLE_AVAILABLE'
  | 'SUMMARY_READY'
  | 'ACTION_AVAILABLE'
  | 'FEEDBACK_REQUESTED';

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  action: {
    label: string;
    href: '/main-menu' | '/couple-activity';
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
  list(signal?: AbortSignal): Promise<NotificationPageDTO> {
    return http.get<NotificationPageDTO>('/api/notifications?limit=5', {
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
