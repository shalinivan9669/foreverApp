import type { PairState } from '@/client/api/types';
import type { PairSummaryDTO } from '@/client/api/pairs.api';
import type { CurrentWeeklyCycleDTO } from '@/client/api/weeklyCycles.api';
import type { RecommendationDecisionDTO } from '@/client/api/recommendations.api';
export type TodayJourney = 'ENTRY' | 'ONBOARDING' | 'LOCATION' | 'CARD' | 'SEARCH' | 'INVITE' | 'INVITE_WAITING' | 'INVITE_CONFIRM';

export type TodayAction = { title: string; description: string; label: string; href: string };
export function selectTodayAction(input: {
  loading: boolean; failed: boolean; userReady: boolean; existingPartnerIntent: boolean;
  pairId: string | null; pairStatus?: PairState | null;
  summary: PairSummaryDTO | null; cycle: CurrentWeeklyCycleDTO | null;
  recommendation: RecommendationDecisionDTO | null;
  journey?: TodayJourney | null;
}): TodayAction | null {
  if (input.loading || input.failed || !input.userReady) return null;
  const { pairId, pairStatus, summary, cycle, recommendation } = input;
  if (!pairId && input.journey) {
    const actions: Record<TodayJourney, TodayAction> = {
      ENTRY: { title: 'Выберите ваш путь', description: 'Расскажите, ищете ли вы партнёра или пришли вдвоём. Это определит следующие шаги.', label: 'Начать знакомство с приложением', href: '/entry' },
      ONBOARDING: { title: 'Продолжите начальную настройку', description: 'Подтвердите условия участия и ответьте на вопросы. Прогресс сохраняется; затем вернёмся к выбранному пути.', label: 'Продолжить настройку', href: '/mvp-onboarding' },
      LOCATION: { title: 'Выберите место поиска', description: 'Для поиска нужен город из списка или приблизительное местоположение. После сохранения вернёмся к вашей карточке; личные занятия доступны и без этого шага.', label: 'Указать место поиска', href: '/entry?intent=matching' },
      CARD: { title: 'Подготовьте карточку знакомств', description: 'Сохраните карточку, выберите предпочтения партнёра и разрешения на подбор. Затем отдельно подтвердите публикацию, чтобы вас увидели другие.', label: 'Настроить карточку и поиск', href: '/match-card/create' },
      SEARCH: { title: 'Можно искать партнёра', description: 'Ваша карточка опубликована. Посмотрите людей, проявите интерес или продолжите начатое знакомство во входящих.', label: 'Перейти к поиску', href: '/search' },
      INVITE: { title: 'Свяжите аккаунты с партнёром', description: 'Откройте приглашение: можно пригласить своего партнёра или проверить его приглашение. Пара появится после взаимного подтверждения.', label: 'Открыть связывание аккаунтов', href: '/invite' },
      INVITE_WAITING: { title: 'Приглашение ждёт партнёра', description: 'Приглашение уже создано. Повторять этот шаг не нужно: передайте партнёру ссылку и проверьте статус ответа.', label: 'Посмотреть приглашение', href: '/invite' },
      INVITE_CONFIRM: { title: 'Подтвердите своего партнёра', description: 'На ваше приглашение ответили. Проверьте, кто присоединился, и подтвердите связывание аккаунтов.', label: 'Проверить и подтвердить', href: '/invite' },
    };
    return actions[input.journey];
  }
  if (!pairId) return input.existingPartnerIntent ? {
    title: 'Начните вместе', description: 'Пригласите партнёра или введите его код. Пара появится после вашего взаимного подтверждения.',
    label: 'Связать партнёра', href: '/invite',
  } : {
    title: 'Выберите время для себя', description: 'Небольшая практика, интересная тема или отдых — начните с того, что подходит вам сегодня.',
    label: 'Выбрать личный шаг', href: '/development',
  };
  const pairHref = `/pair/${encodeURIComponent(pairId)}`;
  // Lifecycle wins over every cached weekly/recommendation state.
  if (pairStatus === 'ended') return {
    title: 'Пара завершена', description: 'Сохранённые результаты доступны в профиле пары. Личные занятия можно продолжать в библиотеке.',
    label: 'Открыть сохранённые результаты', href: pairHref,
  };
  if (pairStatus === 'paused') return {
    title: 'Пара на паузе', description: 'Откройте состояние пары, когда будете готовы. Личные занятия доступны в вашем темпе.',
    label: 'Открыть состояние пары', href: pairHref,
  };
  if ((!summary || summary.nextStep.kind === 'suggest_activity') && cycle?.currentUser.completionStatus === 'SKIPPED') return {
    title: 'На этой неделе — в своём темпе', description: 'Отметка пропущена без штрафа. Можно выбрать лёгкую активность или дождаться нового цикла.',
    label: 'Посмотреть лёгкие активности', href: '/couple-activity',
  };
  if ((!summary || summary.nextStep.kind === 'suggest_activity') && cycle?.pair.dataStatus === 'ENOUGH' && recommendation) return {
    title: recommendation.activity.title.ru, description: recommendation.explanation.ru,
    label: 'Открыть рекомендацию', href: `/couple-activity?pairId=${encodeURIComponent(pairId)}&decisionId=${encodeURIComponent(recommendation.id)}&action=recommendation`,
  };
  // The server selector owns the order of current activity and weekly steps.
  if (summary) {
    const step = summary.nextStep;
    const waiting = step.kind === 'wait_or_invite_peer_checkin';
    const href = step.href ?? pairHref;
    return {
      title: waiting ? 'Ваш ответ сохранён' : step.title,
      description: waiting ? 'Ждём ответ партнёра. Повторно заполнять отметку не нужно; пока можно заняться собой.' : step.description,
      label: waiting ? 'Посмотреть статус' : step.ctaLabel ?? 'Открыть пару',
      href: href.startsWith('#') ? `${pairHref}${href}` : href,
    };
  }
  return { title: 'Текущий шаг пока недоступен', description: 'Состояние и сохранённые результаты можно посмотреть в профиле пары.', label: 'Открыть пару', href: pairHref };
}
export const WEEKLY_COMPLETION_LABELS: Record<CurrentWeeklyCycleDTO['currentUser']['completionStatus'], string> = {
  PENDING: 'Ответ ещё не готов', SUBMITTED: 'Ответ сохранён', SKIPPED: 'Отметка пропущена', EXPIRED: 'Цикл завершён',
};
export const WEEKLY_DATA_LABELS: Record<CurrentWeeklyCycleDTO['pair']['dataStatus'], string> = {
  NOT_READY: 'Ждём ответы', PARTIAL: 'Частичная сводка', ENOUGH: 'Сводка готова', INSUFFICIENT: 'Недостаточно данных', EXPIRED: 'Цикл завершён',
};
export const WEEKLY_SIGNAL_LABELS: Record<CurrentWeeklyCycleDTO['pair']['signals'][number]['key'], string> = {
  connection: 'Тепло и контакт', tension: 'Напряжение', recovery: 'Восстановление', resource: 'Ритм и ресурс',
};
export const WEEKLY_SIGNAL_STATUS: Record<CurrentWeeklyCycleDTO['pair']['signals'][number]['status'], string> = {
  LOW: 'сейчас ниже обычного', STEADY: 'устойчиво', HIGH: 'выражено', MIXED: 'ощущается по-разному',
};
