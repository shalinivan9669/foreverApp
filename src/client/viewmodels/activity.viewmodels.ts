import type { PairActivityDTO } from '@/client/api/types';

const HISTORY_STATUSES: PairActivityDTO['status'][] = [
  'completed_success',
  'completed_partial',
  'failed',
  'cancelled',
  'expired',
];

export const isHistoryActivityStatus = (
  status: PairActivityDTO['status']
): boolean => HISTORY_STATUSES.includes(status);

export const isAwaitingCheckinStatus = (
  status: PairActivityDTO['status']
): boolean =>
  status === 'awaiting_feedback' || status === 'awaiting_checkin';

export type ActivityCardVM = {
  _id: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  why: Record<string, string>;
  targetFactorKeys: string[];
  actionKey?: string;
  archetype: string;
  intent: 'improve' | 'celebrate';
  mode: 'together' | 'solo';
  sync: 'sync' | 'async';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  requiresConsent?: boolean;
  dueAt?: string;
  status: PairActivityDTO['status'];
  checkIns: PairActivityDTO['checkIns'];
  resultSummary?: PairActivityDTO['resultSummary'];
  feedbackSubmitted?: boolean;
  eventSourceBadge?: {
    label: string;
    reason?: string;
  };
  isAwaitingCheckin: boolean;
  isHistory: boolean;
};

const EVENT_REASON_LABELS: Record<string, string> = {
  first_month: 'первый месяц',
  three_months: 'три месяца',
  six_months: 'полгода',
  anniversary: 'годовщина',
  valentines_day: 'день внимания',
  march_8: '8 марта',
  new_year: 'новый год',
  inactive_pair: 'пауза в активностях',
  failed_activity_recovery: 'восстановление после неудачной активности',
  weekly_overload_recovery: 'высокая перегрузка',
  weekly_tension_support: 'мягкая сверка недели',
  weekly_success_celebration: 'успешная неделя',
};

const eventSourceBadge = (
  activity: PairActivityDTO
): ActivityCardVM['eventSourceBadge'] => {
  if (activity.eventSource?.trigger !== 'pair_event') return undefined;
  const reason = activity.eventSource.eventType
    ? EVENT_REASON_LABELS[activity.eventSource.eventType] ?? activity.eventSource.eventType
    : undefined;
  return {
    label: 'Из события пары',
    reason: reason ? `Повод: ${reason}` : undefined,
  };
};

export const toActivityId = (activity: PairActivityDTO): string => activity._id ?? activity.id;

export const toActivityCardVM = (activity: PairActivityDTO): ActivityCardVM => ({
  _id: toActivityId(activity),
  title: activity.title,
  description: activity.description,
  why: activity.why,
  targetFactorKeys: activity.targetFactorKeys,
  actionKey: activity.actionDefinition?.key,
  archetype: activity.archetype,
  intent: activity.intent,
  mode: activity.mode,
  sync: activity.sync,
  difficulty: activity.difficulty,
  intensity: activity.intensity,
  timeEstimateMin: activity.timeEstimateMin,
  requiresConsent: activity.requiresConsent,
  dueAt: activity.dueAt,
  status: activity.status,
  checkIns: activity.checkIns,
  resultSummary: activity.resultSummary,
  feedbackSubmitted: activity.feedbackSubmitted,
  eventSourceBadge: eventSourceBadge(activity),
  isAwaitingCheckin: isAwaitingCheckinStatus(activity.status),
  isHistory: isHistoryActivityStatus(activity.status),
});
