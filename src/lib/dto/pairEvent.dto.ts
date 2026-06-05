import type { Axis } from '@/models/ActivityTemplate';
import type {
  PairEventCategory,
  PairEventStatus,
  PairEventType,
  PairEventTypeModel,
} from '@/models/PairEvent';

type IdLike = string | { toString(): string };
type DateLike = Date | string | undefined | null;

const toId = (value: IdLike | undefined): string => (value ? String(value) : '');
const toIso = (value: DateLike): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

type PairEventSource = PairEventTypeModel & {
  _id?: IdLike;
  pairId: PairEventTypeModel['pairId'] | IdLike;
};

export type PairEventDTO = {
  id: string;
  pairId: string;
  category: PairEventCategory;
  type: PairEventType;
  title: { ru: string; en: string };
  description: { ru: string; en: string };
  why: { ru: string; en: string };
  eventDate?: string;
  windowStart: string;
  windowEnd: string;
  status: PairEventStatus;
  priority: 1 | 2 | 3;
  severity?: 1 | 2 | 3;
  axis?: Axis[];
  canAccept: boolean;
  canDecline: boolean;
  canSnooze: boolean;
  generatedActivityIds: string[];
  acceptedAt?: string;
  declinedAt?: string;
  snoozedUntil?: string;
  completedAt?: string;
  expiresAt?: string;
};

export function toPairEventDTO(event: PairEventSource): PairEventDTO {
  return {
    id: toId(event._id),
    pairId: toId(event.pairId as IdLike),
    category: event.category,
    type: event.type,
    title: event.title,
    description: event.description,
    why: event.why,
    eventDate: toIso(event.eventDate),
    windowStart: event.windowStart.toISOString(),
    windowEnd: event.windowEnd.toISOString(),
    status: event.status,
    priority: event.priority,
    severity: event.severity,
    axis: event.axis?.length ? event.axis : undefined,
    canAccept: event.actionPolicy.canAccept,
    canDecline: event.actionPolicy.canDecline,
    canSnooze: event.actionPolicy.canSnooze,
    generatedActivityIds: event.generatedActivityIds.map((id) => String(id)),
    acceptedAt: toIso(event.acceptedAt),
    declinedAt: toIso(event.declinedAt),
    snoozedUntil: toIso(event.snoozedUntil),
    completedAt: toIso(event.completedAt),
    expiresAt: toIso(event.expiresAt),
  };
}
