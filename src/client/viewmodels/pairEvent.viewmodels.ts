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
    canAccept: event.canAccept && ['upcoming', 'offered', 'snoozed'].includes(event.status),
    canDecline: event.canDecline && !['declined', 'completed', 'expired'].includes(event.status),
    canSnooze: event.canSnooze && ['upcoming', 'offered'].includes(event.status),
    generatedActivityCount: event.generatedActivityIds.length,
    isActionable: ['upcoming', 'offered', 'snoozed'].includes(event.status),
  };
}
