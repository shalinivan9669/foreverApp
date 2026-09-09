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
    href: string;
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

export type NotificationActionContext = {
  cycleKey?: string;
  pairStatus?: 'active' | 'paused' | 'ended' | 'unavailable';
  resourceState?: 'missing' | 'expired' | 'completed' | 'waiting';
  matchingEligible?: boolean;
};

export const toNotificationDTO = (
  notification: StoredNotification,
  context: NotificationActionContext = {}
): NotificationDTO => {
  const copy = COPY[notification.type];
  const pairId = notification.pairId ? encodeURIComponent(String(notification.pairId)) : '';
  const resourceId = notification.resourceId ? encodeURIComponent(notification.resourceId) : '';
  let action: NotificationDTO['action'] = { label: copy.label, href: copy.href };
  let message = copy.message;
  if (pairId) {
    if (notification.type === 'PAIR_JOINED') {
      action = { label: 'Открыть первый шаг пары', href: `/pair/${pairId}?action=check-in#weekly-checkin` };
    } else if (notification.type === 'CYCLE_AVAILABLE' || notification.type === 'SUMMARY_READY') {
      const intent = notification.type === 'SUMMARY_READY' ? 'summary' : 'check-in';
      action = {
        label: intent === 'summary' ? 'Посмотреть сводку цикла' : 'Заполнить отметку недели',
        href: `/pair/${pairId}?${resourceId ? `cycleId=${resourceId}&` : ''}${context.cycleKey ? `cycleKey=${encodeURIComponent(context.cycleKey)}&` : ''}action=${intent}#weekly-checkin`,
      };
    } else {
      const intent = notification.type === 'FEEDBACK_REQUESTED' ? 'feedback' : 'recommendation';
      action = {
        label: intent === 'feedback' ? 'Оставить личный отзыв' : 'Посмотреть рекомендацию',
        href: `/couple-activity?pairId=${pairId}${resourceId ? `&${intent === 'feedback' ? 'activityId' : 'decisionId'}=${resourceId}` : ''}&action=${intent}`,
      };
    }
    if (!resourceId && notification.type !== 'PAIR_JOINED') {
      message = 'Это прежнее уведомление без ссылки на конкретную запись. Проверьте актуальный шаг пары; повторять выполненное не требуется.';
      action = { label: 'Проверить текущий шаг пары', href: `/pair/${pairId}?action=check-in#weekly-checkin` };
    }
    if (context.resourceState === 'waiting' || context.resourceState === 'completed') {
      message = context.resourceState === 'waiting'
        ? 'Ваш ответ уже сохранён. Повторять его не требуется; общий итог появится после ответа партнёра.'
        : 'Этот шаг уже выполнен. Можно посмотреть его результат.';
      action.label = 'Посмотреть состояние и результат';
      action.href = action.href.replace('action=feedback', 'action=result').replace('action=check-in', 'action=summary');
    } else if (context.resourceState === 'expired' || context.resourceState === 'missing') {
      message = context.resourceState === 'expired'
        ? 'Срок этого шага завершён или предложение уже изменилось. Выполнять прежнее действие не требуется.'
        : 'Запись из уведомления больше недоступна. Проверьте актуальное состояние пары.';
      action.label = 'Проверить состояние шага';
    }
    if (context.pairStatus && context.pairStatus !== 'active') {
      message = context.pairStatus === 'paused'
        ? 'Пара на паузе. Новые совместные ответы сейчас недоступны; проверьте состояние пары.'
        : 'Уведомление относится к прежней или недоступной паре. Выполнять это действие больше не нужно.';
      action = { label: 'Открыть состояние пары', href: context.pairStatus === 'paused' ? `/pair/${pairId}` : '/pair' };
    }
  } else if (context.matchingEligible === false) {
    message = 'Это уведомление из прежнего режима знакомств. Сейчас поиск новых партнёров недоступен; история сохраняется.';
    action = { label: 'Открыть текущий маршрут', href: '/main-menu' };
  }
  return {
    id: String(notification._id),
    type: notification.type,
    title: copy.title,
    message,
    action,
    isRead: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
};
