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
): boolean => status === 'awaiting_checkin';

export type ActivityCardVM = {
  _id: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  axis: string[] | string;
  archetype: string;
  intent: 'improve' | 'celebrate';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  dueAt?: string;
  status: PairActivityDTO['status'];
  checkIns: PairActivityDTO['checkIns'];
  isAwaitingCheckin: boolean;
  isHistory: boolean;
};

export const toActivityId = (activity: PairActivityDTO): string => activity._id ?? activity.id;

export const toActivityCardVM = (activity: PairActivityDTO): ActivityCardVM => ({
  _id: toActivityId(activity),
  title: activity.title,
  description: activity.description,
  axis: activity.axis,
  archetype: activity.archetype,
  intent: activity.intent,
  difficulty: activity.difficulty,
  intensity: activity.intensity,
  timeEstimateMin: activity.timeEstimateMin,
  dueAt: activity.dueAt,
  status: activity.status,
  checkIns: activity.checkIns,
  isAwaitingCheckin: isAwaitingCheckinStatus(activity.status),
  isHistory: isHistoryActivityStatus(activity.status),
});
