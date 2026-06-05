import type { PairEventDTO, PairEventStatus } from '@/client/api/types';

const STATUS_LABELS: Record<PairEventStatus, string> = {
  upcoming: 'Скоро',
  offered: 'Актуально сейчас',
  accepted: 'Принято',
  declined: 'Скрыто',
  snoozed: 'Отложено',
  expired: 'Истекло',
  completed: 'Завершено',
};

const PRIORITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Важно сейчас',
  2: 'Полезный повод',
  3: 'Можно по желанию',
};

const SEVERITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'мягкий сигнал',
  2: 'заметный сигнал',
  3: 'высокий сигнал',
};

const formatDate = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('ru-RU') : '';

const formatWindow = (event: PairEventDTO): string => {
  const start = formatDate(event.windowStart);
  const end = formatDate(event.windowEnd);
  if (event.eventDate) return `${formatDate(event.eventDate)} · окно ${start} - ${end}`;
  return `${start} - ${end}`;
};

const DECLINABLE_STATUSES: PairEventStatus[] = ['upcoming', 'offered', 'snoozed'];
const SNOOZABLE_STATUSES: PairEventStatus[] = ['upcoming', 'offered'];
const ACCEPTABLE_STATUSES: PairEventStatus[] = ['upcoming', 'offered', 'snoozed'];

export type PairEventCardVM = {
  id: string;
  title: string;
  description: string;
  why: string;
  statusLabel: string;
  priorityLabel: string;
  severityLabel?: string;
  dateLabel: string;
  canAccept: boolean;
  canDecline: boolean;
  canSnooze: boolean;
  generatedActivityCount: number;
  hasGeneratedActivities: boolean;
  isAccepted: boolean;
  isActionable: boolean;
};

export function toPairEventCardVM(event: PairEventDTO): PairEventCardVM {
  return {
    id: event.id,
    title: event.title.ru || event.title.en,
    description: event.description.ru || event.description.en,
    why: event.why.ru || event.why.en,
    statusLabel:
      event.status === 'snoozed' && event.snoozedUntil
        ? `Отложено до ${formatDate(event.snoozedUntil)}`
        : STATUS_LABELS[event.status],
    priorityLabel: PRIORITY_LABELS[event.priority],
    severityLabel: event.severity ? SEVERITY_LABELS[event.severity] : undefined,
    dateLabel: formatWindow(event),
    canAccept: event.canAccept && ACCEPTABLE_STATUSES.includes(event.status),
    canDecline: event.canDecline && DECLINABLE_STATUSES.includes(event.status),
    canSnooze: event.canSnooze && SNOOZABLE_STATUSES.includes(event.status),
    generatedActivityCount: event.generatedActivityIds.length,
    hasGeneratedActivities: event.generatedActivityIds.length > 0,
    isAccepted: event.status === 'accepted',
    isActionable: ACCEPTABLE_STATUSES.includes(event.status),
  };
}
