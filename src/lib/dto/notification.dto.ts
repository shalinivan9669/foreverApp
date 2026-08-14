import type {
  NotificationDocumentType,
  NotificationType,
} from '@/models/Notification';

type StoredNotification = NotificationDocumentType & {
  _id: string | { toString(): string };
};

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  action: {
    label: string;
    href: '/main-menu' | '/couple-activity' | '/match/inbox';
  };
  isRead: boolean;
  createdAt: string;
};

const COPY: Record<
  NotificationType,
  {
    title: string;
    message: string;
    label: string;
    href: NotificationDTO['action']['href'];
  }
> = {
  PAIR_JOINED: {
    title: 'Вы вместе',
    message: 'Партнёр присоединился. Можно перейти к следующему шагу.',
    label: 'Открыть сегодня',
    href: '/main-menu',
  },
  CYCLE_AVAILABLE: {
    title: 'Доступен новый цикл',
    message: 'Можно отметить своё состояние, когда будет удобно.',
    label: 'Открыть сегодня',
    href: '/main-menu',
  },
  SUMMARY_READY: {
    title: 'Общий результат готов',
    message: 'Откройте нейтральное резюме и следующий шаг.',
    label: 'Посмотреть',
    href: '/main-menu',
  },
  ACTION_AVAILABLE: {
    title: 'Есть совместное действие',
    message: 'Для пары доступен один небольшой следующий шаг.',
    label: 'Открыть',
    href: '/couple-activity',
  },
  FEEDBACK_REQUESTED: {
    title: 'Нужна ваша обратная связь',
    message: 'Можно отдельно отметить, как прошло совместное действие.',
    label: 'Продолжить',
    href: '/couple-activity',
  },
  MATCH_LIKE_RECEIVED: {
    title: 'Новое знакомство',
    message: 'Вам отправили запрос. Ответить можно во входящих знакомствах.',
    label: 'Открыть входящие',
    href: '/match/inbox',
  },
  MATCH_LIKE_RESPONDED: {
    title: 'На запрос ответили',
    message: 'Во входящих знакомствах появился ответ на ваш запрос.',
    label: 'Открыть входящие',
    href: '/match/inbox',
  },
  MATCH_CONNECTED: {
    title: 'Знакомство взаимно',
    message: 'У вас появилась связь. Решение о создании пары остаётся за вами обоими.',
    label: 'Открыть знакомства',
    href: '/match/inbox',
  },
  MATCH_CONFIRMATION_REQUESTED: {
    title: 'Запрос на создание пары',
    message: 'Другой участник предложил перейти в режим пары. Подтвердите только по своему решению.',
    label: 'Открыть знакомства',
    href: '/match/inbox',
  },
};

export const toNotificationDTO = (
  notification: StoredNotification
): NotificationDTO => {
  const copy = COPY[notification.type];
  return {
    id: String(notification._id),
    type: notification.type,
    title: copy.title,
    message: copy.message,
    action: { label: copy.label, href: copy.href },
    isRead: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
};
