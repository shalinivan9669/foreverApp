import type { ActivityCardVM } from './activity.viewmodels';

export type ActivityNotificationTarget = {
  tab: 'active' | 'history';
  openFeedback: boolean;
  message: string | null;
};

export const resolveActivityNotificationTarget = (input: {
  action: string | null;
  activity: ActivityCardVM | null;
  feedbackSubmitted?: boolean;
}): ActivityNotificationTarget => {
  const { activity, action, feedbackSubmitted } = input;
  if (!activity) return { tab: 'history', openFeedback: false, message: 'Активность из уведомления не найдена в этой паре или больше недоступна. Проверьте текущий шаг.' };
  const tab = activity.isHistory ? 'history' : 'active';
  if (activity.resultSummary?.bothSubmitted) return { tab, openFeedback: false, message: 'Оба отзыва уже сохранены. Ниже показан общий итог активности.' };
  if (feedbackSubmitted) return { tab, openFeedback: false, message: 'Ваш отзыв уже сохранён. Повторять его не требуется; ожидаем ответ партнёра.' };
  if (action === 'feedback' && feedbackSubmitted === undefined) return { tab, openFeedback: false, message: 'Статус вашего отзыва ещё не подтверждён. Обновите состояние активности перед заполнением.' };
  if (['cancelled', 'expired', 'failed', 'completed_success'].includes(activity.status)) return { tab, openFeedback: false, message: 'Эта активность завершена или отменена. Дополнительный отзыв больше не требуется.' };
  if (activity.status === 'accepted') return { tab, openFeedback: false, message: 'Сначала начните совместную активность. После выполнения можно оставить личный отзыв.' };
  return { tab, openFeedback: action === 'feedback', message: action === 'result' ? 'Показано актуальное состояние активности. Личные ответы партнёра не раскрываются.' : null };
};
