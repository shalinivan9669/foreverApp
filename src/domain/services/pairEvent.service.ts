import mongoose, { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairEvent, type PairEventStatus, type PairEventType, type PairEventTypeModel } from '@/models/PairEvent';
import type { Axis } from '@/models/ActivityTemplate';
import { toPairActivityDTO, toPairEventDTO, type PairActivityDTO, type PairEventDTO } from '@/lib/dto';
import {
  buildPairWeeklyCheckInSummary,
  currentWeekKey,
  type PairWeeklyCheckInSummaryDTO,
} from '@/domain/services/weeklyCheckIn.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { isPairSafetyVetoActive } from '@/domain/services/safetyGate.service';
import {
  hasP0SensitiveActivityAxis,
  isActivityEligibleForSafetyState,
} from '@/domain/services/activityEligibility.service';

type PairDoc = HydratedDocument<PairType>;
type StoredEvent = PairEventTypeModel & { _id: Types.ObjectId };
type StoredActivity = PairActivityType & { _id: Types.ObjectId };
type PairMemberUser = UserType & { _id: Types.ObjectId };

type LocalText = { ru: string; en: string };

export type PairEventCandidate = Omit<
  PairEventTypeModel,
  'pairId' | 'generatedActivityIds' | 'createdAt' | 'updatedAt'
>;

export type PairEventRuleInput = {
  pairId: string;
  pairStatus: PairType['status'];
  pairCreatedAt?: Date;
  weekly?: PairWeeklyCheckInSummaryDTO;
  hasCurrentActivity: boolean;
  latestFinalActivity?: {
    id: string;
    status: Extract<PairActivityType['status'], 'completed_success' | 'completed_partial' | 'failed'>;
  };
  completedActivityCountLast14Days: number;
  diagnostics?: {
    riskZones?: Array<{ axis: string; severity: 1 | 2 | 3 }>;
    lastDiagnosticsAt?: Date;
  };
  now: Date;
};

export type RefreshPairEventsInput = {
  pairId: string;
  currentUserId: string;
  include?: 'active' | 'all';
  now?: Date;
};

export type PairEventMutationInput = {
  pairId: string;
  eventId: string;
  currentUserId: string;
  now?: Date;
};

export type SnoozePairEventInput = PairEventMutationInput & {
  days?: 1 | 3 | 7;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_ACTIVITY_STATUSES: PairActivityType['status'][] = [
  'accepted',
  'in_progress',
  'awaiting_checkin',
];
const FINAL_ACTIVITY_STATUSES: PairActivityType['status'][] = [
  'completed_success',
  'completed_partial',
  'failed',
  'cancelled',
  'expired',
];

const eventEligibleForPairProjection = (
  event: Pick<PairEventTypeModel, 'axis' | 'category'>,
  safetyVeto: boolean
): boolean =>
  !hasP0SensitiveActivityAxis(event.axis ?? []) &&
  (!safetyVeto || event.category !== 'system_signal');

const assertEventEligibleForPairProjection = (
  event: Pick<PairEventTypeModel, 'axis' | 'category'>,
  safetyVeto: boolean
): void => {
  if (!eventEligibleForPairProjection(event, safetyVeto)) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'event not found',
    });
  }
};
const ACTIVE_EVENT_STATUSES: PairEventStatus[] = [
  'upcoming',
  'offered',
  'accepted',
  'snoozed',
];
const TERMINAL_EVENT_STATUSES: PairEventStatus[] = [
  'accepted',
  'completed',
  'declined',
];
const ACCEPTABLE_EVENT_STATUSES: PairEventStatus[] = ['upcoming', 'offered', 'snoozed'];
const DECLINABLE_EVENT_STATUSES: PairEventStatus[] = ['upcoming', 'offered', 'snoozed'];
const SNOOZABLE_EVENT_STATUSES: PairEventStatus[] = ['upcoming', 'offered'];

const LOOK_AHEAD_DAYS = 45;
const LOOK_BACK_DAYS = 14;

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_MS);

const utcDate = (year: number, monthIndex: number, day: number): Date =>
  new Date(Date.UTC(year, monthIndex, day));

const addUtcMonths = (date: Date, months: number): Date =>
  utcDate(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

const inHorizon = (candidate: Pick<PairEventCandidate, 'windowStart' | 'windowEnd'>, now: Date): boolean =>
  candidate.windowEnd.getTime() >= addDays(now, -LOOK_BACK_DAYS).getTime() &&
  candidate.windowStart.getTime() <= addDays(now, LOOK_AHEAD_DAYS).getTime();

export type PairEventLifecycleSnapshot = Pick<
  PairEventTypeModel,
  'status' | 'actionPolicy' | 'expiresAt' | 'snoozedUntil'
>;

const eventExpiredAt = (event: Pick<PairEventLifecycleSnapshot, 'expiresAt'>, now: Date): boolean =>
  Boolean(event.expiresAt && now > event.expiresAt);

export const eventCanBeAccepted = (event: PairEventLifecycleSnapshot, now: Date): boolean => {
  if (!event.actionPolicy.canAccept) return false;
  if (event.status === 'accepted') return true;
  return ACCEPTABLE_EVENT_STATUSES.includes(event.status) && !eventExpiredAt(event, now);
};

export const eventCanBeDeclined = (event: PairEventLifecycleSnapshot, now: Date): boolean => {
  if (!event.actionPolicy.canDecline) return false;
  return DECLINABLE_EVENT_STATUSES.includes(event.status) && !eventExpiredAt(event, now);
};

export const eventCanBeSnoozed = (event: PairEventLifecycleSnapshot, now: Date): boolean => {
  if (!event.actionPolicy.canSnooze) return false;
  return SNOOZABLE_EVENT_STATUSES.includes(event.status) && !eventExpiredAt(event, now);
};

export const resolvePairEventStatus = (
  candidate: Pick<PairEventCandidate, 'windowStart' | 'windowEnd' | 'expiresAt'>,
  existing: Pick<PairEventTypeModel, 'status' | 'snoozedUntil'> | null,
  now: Date
): PairEventStatus => {
  if (existing && TERMINAL_EVENT_STATUSES.includes(existing.status)) {
    return existing.status;
  }
  if (existing?.status === 'snoozed' && existing.snoozedUntil && existing.snoozedUntil > now) {
    return 'snoozed';
  }
  if (candidate.expiresAt && now > candidate.expiresAt) return 'expired';
  if (now < candidate.windowStart) return 'upcoming';
  if (now <= candidate.windowEnd) return 'offered';
  return 'expired';
};

const eventText = (
  ru: { title: string; description: string; why: string },
  enTitle = ru.title
): { title: LocalText; description: LocalText; why: LocalText } => ({
  title: { ru: ru.title, en: enTitle },
  description: { ru: ru.description, en: ru.description },
  why: { ru: ru.why, en: ru.why },
});

const baseEvent = (input: {
  pairId: string;
  type: PairEventType;
  category: PairEventCandidate['category'];
  eventDate?: Date;
  windowStart: Date;
  windowEnd: Date;
  priority: 1 | 2 | 3;
  severity?: 1 | 2 | 3;
  axis?: Axis[];
  source: PairEventCandidate['source'];
  text: { title: LocalText; description: LocalText; why: LocalText };
  maxGeneratedActivities?: 1 | 2 | 3;
}): PairEventCandidate => ({
  key: `${input.pairId}:${input.type}:${dateKey(input.eventDate ?? input.windowStart)}`,
  category: input.category,
  type: input.type,
  ...input.text,
  eventDate: input.eventDate,
  windowStart: input.windowStart,
  windowEnd: input.windowEnd,
  expiresAt: input.windowEnd,
  status: 'upcoming',
  priority: input.priority,
  severity: input.severity,
  axis: input.axis ?? [],
  source: input.source,
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: true,
    maxGeneratedActivities: input.maxGeneratedActivities ?? 2,
  },
});

const milestoneTexts: Record<
  Extract<PairEventType, 'first_month' | 'three_months' | 'six_months' | 'anniversary'>,
  { title: string; description: string; why: string }
> = {
  first_month: {
    title: 'Первый месяц вместе',
    description: 'Хороший момент спокойно вспомнить, что уже получилось, и договориться о следующем месяце.',
    why: 'Такие даты помогают не просто отметить повод, а укрепить ритм пары.',
  },
  three_months: {
    title: 'Три месяца вместе',
    description: 'Подходящий момент сверить ожидания и понять, что стоит сохранить, а что изменить.',
    why: 'На этом сроке часто проявляются первые устойчивые привычки пары.',
  },
  six_months: {
    title: 'Полгода вместе',
    description: 'Время посмотреть на общие правила, бытовой ритм и личные ожидания.',
    why: 'Полгода - хороший рубеж для честной сверки без драматизации.',
  },
  anniversary: {
    title: 'Годовщина пары',
    description: 'Можно не просто отпраздновать, а отметить рост пары и выбрать новый общий ориентир.',
    why: 'Годовщина работает лучше, когда у нее есть смысл, а не только формальность.',
  },
};

const calendarTexts: Record<
  Extract<PairEventType, 'valentines_day' | 'march_8' | 'new_year'>,
  { title: string; description: string; why: string }
> = {
  valentines_day: {
    title: 'День для внимания друг к другу',
    description: 'Можно выбрать спокойный формат: короткое свидание, разговор или жест заботы.',
    why: 'Смысл события не в обязательном романтическом сценарии, а в осознанном внимании.',
  },
  march_8: {
    title: '8 марта',
    description: 'Повод заранее выбрать жест внимания без давления и угадывания ожиданий.',
    why: 'Лучше спокойно уточнить формат, чем действовать наугад и копить недовольство.',
  },
  new_year: {
    title: 'Новый год пары',
    description: 'Хороший момент подвести итог и выбрать один общий ориентир на следующий период.',
    why: 'Смена года помогает паре обновить правила, планы и ритуалы.',
  },
};

const relationshipMilestones = (input: PairEventRuleInput): PairEventCandidate[] => {
  if (!input.pairCreatedAt) return [];
  const createdAt = input.pairCreatedAt;
  const definitions: Array<{ type: 'first_month' | 'three_months' | 'six_months'; months: number }> = [
    { type: 'first_month', months: 1 },
    { type: 'three_months', months: 3 },
    { type: 'six_months', months: 6 },
  ];

  const items = definitions.map(({ type, months }) => {
    const eventDate = addUtcMonths(createdAt, months);
    return baseEvent({
      pairId: input.pairId,
      type,
      category: 'relationship_milestone',
      eventDate,
      windowStart: addDays(eventDate, -7),
      windowEnd: addDays(eventDate, 7),
      priority: 2,
      axis: ['communication'],
      source: { kind: 'pair_created_at', date: createdAt },
      text: eventText(milestoneTexts[type]),
      maxGeneratedActivities: 2,
    });
  });

  const yearsTogether = input.now.getUTCFullYear() - createdAt.getUTCFullYear();
  const anniversaryYears = [yearsTogether, yearsTogether + 1].filter((year) => year >= 1);
  for (const year of anniversaryYears) {
    const eventDate = utcDate(
      createdAt.getUTCFullYear() + year,
      createdAt.getUTCMonth(),
      createdAt.getUTCDate()
    );
    items.push(
      baseEvent({
        pairId: input.pairId,
        type: 'anniversary',
        category: 'relationship_milestone',
        eventDate,
        windowStart: addDays(eventDate, -7),
        windowEnd: addDays(eventDate, 7),
        priority: 2,
        axis: ['communication', 'personalViews'],
        source: { kind: 'pair_created_at', date: createdAt },
        text: eventText(milestoneTexts.anniversary),
        maxGeneratedActivities: 3,
      })
    );
  }

  return items.filter((event) => inHorizon(event, input.now));
};

const calendarEvents = (input: PairEventRuleInput): PairEventCandidate[] => {
  const year = input.now.getUTCFullYear();
  // partner_birthday is reserved for a future privacy-reviewed birthday data model.
  const definitions = [
    {
      type: 'valentines_day' as const,
      eventDate: utcDate(year, 1, 14),
      windowStart: utcDate(year, 1, 7),
      windowEnd: utcDate(year, 1, 15),
      axis: ['communication', 'sexuality'] as Axis[],
    },
    {
      type: 'march_8' as const,
      eventDate: utcDate(year, 2, 8),
      windowStart: utcDate(year, 2, 1),
      windowEnd: utcDate(year, 2, 9),
      axis: ['communication'] as Axis[],
    },
    {
      type: 'new_year' as const,
      eventDate: utcDate(year, 11, 31),
      windowStart: utcDate(year, 11, 25),
      windowEnd: utcDate(year + 1, 0, 3),
      axis: ['personalViews', 'communication'] as Axis[],
    },
    {
      type: 'new_year' as const,
      eventDate: utcDate(year - 1, 11, 31),
      windowStart: utcDate(year - 1, 11, 25),
      windowEnd: utcDate(year, 0, 3),
      axis: ['personalViews', 'communication'] as Axis[],
    },
  ];

  return definitions
    .map((definition) =>
      baseEvent({
        pairId: input.pairId,
        type: definition.type,
        category: 'calendar_event',
        eventDate: definition.eventDate,
        windowStart: definition.windowStart,
        windowEnd: definition.windowEnd,
        priority: 3,
        axis: definition.axis,
        source: { kind: 'calendar_rule', date: definition.eventDate },
        text: eventText(calendarTexts[definition.type]),
        maxGeneratedActivities: 2,
      })
    )
    .filter((event) => inHorizon(event, input.now));
};

const highestDivergence = (weekly: PairWeeklyCheckInSummaryDTO): number =>
  Math.max(0, ...Object.values(weekly.pair.divergence ?? {}).filter((value): value is number => typeof value === 'number'));

const toAxis = (axis?: string): Axis | undefined => {
  const valid = new Set<Axis>(['communication', 'domestic', 'personalViews', 'psyche']);
  return axis && valid.has(axis as Axis) ? (axis as Axis) : undefined;
};

const behavioralEvents = (input: PairEventRuleInput): PairEventCandidate[] => {
  const items: PairEventCandidate[] = [];
  const weekKey = input.weekly?.weekKey ?? currentWeekKey(input.now);
  if (!input.hasCurrentActivity && input.completedActivityCountLast14Days === 0) {
    items.push({
      ...baseEvent({
        pairId: input.pairId,
        type: 'inactive_pair',
        category: 'behavioral_event',
        windowStart: addDays(input.now, -1),
        windowEnd: addDays(input.now, 13),
        priority: 2,
        axis: ['psyche', 'communication'],
        source: { kind: 'activity_history', weekKey },
        text: eventText({
          title: 'Давно не было совместного действия',
          description: 'Лучше не начинать с тяжелого разговора. Подойдет короткая легкая активность.',
          why: 'Регулярность важнее редких больших рывков.',
        }),
      }),
      key: `${input.pairId}:inactive_pair:${weekKey}`,
    });
  }

  if (input.latestFinalActivity?.status === 'failed') {
    items.push({
      ...baseEvent({
        pairId: input.pairId,
        type: 'failed_activity_recovery',
        category: 'behavioral_event',
        windowStart: addDays(input.now, -1),
        windowEnd: addDays(input.now, 13),
        priority: 1,
        severity: 2,
        axis: ['psyche', 'communication'],
        source: { kind: 'activity_history', refId: input.latestFinalActivity.id },
        text: eventText({
          title: 'После неудачного формата',
          description: 'Предыдущая активность не зашла. Лучше выбрать более мягкий восстановительный шаг.',
          why: 'Неудачный формат - не провал пары, а сигнал подобрать другой подход.',
        }),
      }),
      key: `${input.pairId}:failed_activity_recovery:${input.latestFinalActivity.id}`,
    });
  }

  const weekly = input.weekly;
  if (weekly) {
    const fatigue = weekly.pair.fatigue;
    if (typeof fatigue === 'number' && fatigue >= 0.75) {
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'high_fatigue_recovery',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 1,
          severity: fatigue >= 0.85 ? 3 : 2,
          axis: ['psyche'],
          source: { kind: 'weekly_checkin', weekKey },
          text: eventText({
            title: 'Неделя с высокой усталостью',
            description: 'Сейчас лучше не перегружать пару. Подойдет мягкий формат восстановления.',
            why: 'При высокой усталости тяжелые разговоры часто дают хуже результат.',
          }),
        }),
        key: `${input.pairId}:high_fatigue_recovery:${weekKey}`,
      });
    }

    if (weekly.pair.hasDivergence) {
      const divergence = highestDivergence(weekly);
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'weekly_divergence_repair',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 1,
          severity: divergence >= 0.55 ? 3 : 2,
          axis: ['communication'],
          source: { kind: 'weekly_checkin', weekKey },
          text: eventText({
            title: 'Есть расхождение в ощущении недели',
            description: 'Лучше начать с короткой сверки без обвинений и попытки сразу все решить.',
            why: 'Расхождение в ответах - сигнал синхронизироваться, а не спорить о том, кто прав.',
          }),
        }),
        key: `${input.pairId}:weekly_divergence_repair:${weekKey}`,
      });
    }

    if (
      weekly.pair.bothSubmitted &&
      weekly.pair.hasDivergence === false &&
      typeof weekly.pair.fatigue === 'number' &&
      typeof weekly.pair.readiness === 'number' &&
      weekly.pair.fatigue <= 0.35 &&
      weekly.pair.readiness >= 0.7
    ) {
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'weekly_success_celebration',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 3,
          axis: ['communication', 'psyche'],
          source: { kind: 'weekly_checkin', weekKey },
          text: eventText({
            title: 'Хорошая неделя для пары',
            description: 'Можно закрепить удачный ритм коротким приятным действием.',
            why: 'Сильные недели тоже стоит замечать, а не только чинить проблемы.',
          }),
        }),
        key: `${input.pairId}:weekly_success_celebration:${weekKey}`,
      });
    }
  }

  const topRisk = (input.diagnostics?.riskZones ?? [])
    .filter((risk) => risk.severity === 3)
    .sort((left, right) => right.severity - left.severity)[0];
  const riskAxis = toAxis(topRisk?.axis);
  if (topRisk && riskAxis && input.diagnostics?.lastDiagnosticsAt && !input.hasCurrentActivity) {
    items.push({
      ...baseEvent({
        pairId: input.pairId,
        type: 'diagnostics_risk_focus',
        category: 'system_signal',
        windowStart: addDays(input.now, -1),
        windowEnd: addDays(input.now, 14),
        priority: 1,
        severity: 3,
        axis: [riskAxis],
        source: {
          kind: 'diagnostics',
          weekKey,
          date: input.diagnostics.lastDiagnosticsAt,
          refId: riskAxis,
        },
        text: eventText({
          title: 'Важная зона внимания',
          description: 'В диагностике есть высокий сигнал. Лучше выбрать один короткий безопасный шаг.',
          why: 'Высокий риск лучше разбирать маленькими действиями, а не большим тяжелым разговором.',
        }),
      }),
      key: `${input.pairId}:diagnostics_risk_focus:${riskAxis}:${dateKey(input.diagnostics.lastDiagnosticsAt)}`,
    });
  }

  return items;
};

export const buildPairEventCandidates = (input: PairEventRuleInput): PairEventCandidate[] => {
  if (input.pairStatus === 'ended') return [];
  const byKey = new Map<string, PairEventCandidate>();
  for (const candidate of [
    ...relationshipMilestones(input),
    ...calendarEvents(input),
    ...behavioralEvents(input),
  ]) {
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
  }
  return Array.from(byKey.values());
};

const guardFailure = async (response: Response): Promise<DomainError> => {
  const payload = await response.clone().json().catch(() => null) as {
    error?: { code?: string; message?: string };
  } | null;
  return new DomainError({
    code: payload?.error?.code ?? 'NOT_FOUND',
    status: response.status || 404,
    message: payload?.error?.message ?? 'pair not found',
  });
};

const ensurePairMember = async (pairId: string, currentUserId: string): Promise<PairDoc> => {
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) throw await guardFailure(guard.response);
  return guard.data.pair;
};

const eventSort = (left: StoredEvent, right: StoredEvent): number => {
  const offeredRank = (event: StoredEvent) => (event.status === 'offered' ? 0 : event.status === 'snoozed' ? 1 : 2);
  const rankDiff = offeredRank(left) - offeredRank(right);
  if (rankDiff) return rankDiff;
  const priorityDiff = left.priority - right.priority;
  if (priorityDiff) return priorityDiff;
  const severityDiff = (right.severity ?? 0) - (left.severity ?? 0);
  if (severityDiff) return severityDiff;
  const dateDiff =
    (left.eventDate ?? left.windowStart).getTime() -
    (right.eventDate ?? right.windowStart).getTime();
  if (dateDiff) return dateDiff;
  return (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0);
};

const upsertCandidates = async (input: {
  pairId: Types.ObjectId;
  candidates: PairEventCandidate[];
  now: Date;
}): Promise<void> => {
  for (const candidate of input.candidates) {
    const existing = await PairEvent.findOne({ pairId: input.pairId, key: candidate.key }).lean<StoredEvent | null>();
    const status = resolvePairEventStatus(candidate, existing, input.now);
    const setPayload: Partial<PairEventTypeModel> = {
      title: candidate.title,
      description: candidate.description,
      why: candidate.why,
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      expiresAt: candidate.expiresAt,
      priority: candidate.priority,
      severity: candidate.severity,
      axis: candidate.axis,
      actionPolicy: candidate.actionPolicy,
      status,
    };
    await PairEvent.updateOne(
      { pairId: input.pairId, key: candidate.key },
      {
        $setOnInsert: {
          pairId: input.pairId,
          key: candidate.key,
          category: candidate.category,
          type: candidate.type,
          eventDate: candidate.eventDate,
          source: candidate.source,
          generatedActivityIds: [],
        },
        $set: setPayload,
      },
      { upsert: true }
    );
  }
};

const refreshExpiredAndCompleted = async (pairId: Types.ObjectId, now: Date): Promise<void> => {
  await PairEvent.updateMany(
    {
      pairId,
      expiresAt: { $lt: now },
      status: { $nin: ['accepted', 'completed', 'declined'] },
    },
    { $set: { status: 'expired' } }
  );

  const accepted = await PairEvent.find({
    pairId,
    status: 'accepted',
    generatedActivityIds: { $exists: true, $ne: [] },
  }).lean<StoredEvent[]>();
  for (const event of accepted) {
    const activities = await PairActivity.find({ _id: { $in: event.generatedActivityIds } })
      .select({ status: 1 })
      .lean<Array<Pick<StoredActivity, '_id' | 'status'>>>();
    if (
      activities.length === event.generatedActivityIds.length &&
      activities.every((activity) => FINAL_ACTIVITY_STATUSES.includes(activity.status))
    ) {
      await PairEvent.updateOne(
        { _id: event._id },
        { $set: { status: 'completed', completedAt: now } }
      );
    }
  }
};

const loadRuleInput = async (input: {
  pair: PairDoc;
  currentUserId: string;
  now: Date;
}): Promise<PairEventRuleInput> => {
  const pairId = input.pair._id as Types.ObjectId;
  const since = addDays(input.now, -14);
  const [weekly, current, latestFinal, completedRecent] = await Promise.all([
    buildPairWeeklyCheckInSummary({ pair: input.pair, currentUserId: input.currentUserId }),
    PairActivity.findOne({ pairId, status: { $in: ACTIVE_ACTIVITY_STATUSES } })
      .select({ _id: 1 })
      .lean<Pick<StoredActivity, '_id'> | null>(),
    PairActivity.findOne({ pairId, status: { $in: ['completed_success', 'completed_partial', 'failed'] } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select({ _id: 1, status: 1 })
      .lean<Pick<StoredActivity, '_id' | 'status'> | null>(),
    PairActivity.countDocuments({
      pairId,
      status: { $in: ['completed_success', 'completed_partial'] },
      updatedAt: { $gte: since },
    }),
  ]);

  return {
    pairId: String(pairId),
    pairStatus: input.pair.status,
    pairCreatedAt: input.pair.createdAt,
    weekly,
    hasCurrentActivity: Boolean(current),
    latestFinalActivity: latestFinal
      ? {
          id: String(latestFinal._id),
          status: latestFinal.status as 'completed_success' | 'completed_partial' | 'failed',
        }
      : undefined,
    completedActivityCountLast14Days: completedRecent,
    diagnostics: {
      riskZones: input.pair.passport?.riskZones ?? [],
      lastDiagnosticsAt: input.pair.passport?.lastDiagnosticsAt,
    },
    now: input.now,
  };
};

const findVisibleEvents = async (
  pairId: Types.ObjectId,
  include: 'active' | 'all'
): Promise<StoredEvent[]> => {
  const filter =
    include === 'all'
      ? { pairId }
      : { pairId, status: { $in: ACTIVE_EVENT_STATUSES } };
  const events = await PairEvent.find(filter).lean<StoredEvent[]>();
  return events.sort(eventSort);
};

type EventActivityTemplate = {
  id: string;
  canonicalTemplateId?: string;
  title: string;
  description: string;
  why: string;
  axis: Axis[];
  archetype: PairActivityType['archetype'];
  intent: PairActivityType['intent'];
  difficulty: PairActivityType['difficulty'];
  intensity: PairActivityType['intensity'];
  minutes: number;
};

const safetyEventActivityTemplate = (): EventActivityTemplate => {
  const fallback = SYSTEM_ACTIVITY_TEMPLATES.find(
    (template) => template._id === 'system-resource-relief'
  );
  if (!fallback) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Safety activity fallback is unavailable',
    });
  }
  return {
    id: 'neutral-resource-relief',
    canonicalTemplateId: String(fallback._id),
    title: fallback.title.ru ?? fallback.title.en ?? '',
    description: fallback.description.ru ?? fallback.description.en ?? '',
    why: fallback.why.ru ?? fallback.why.en ?? '',
    axis: fallback.axis,
    archetype: fallback.archetype,
    intent: fallback.intent,
    difficulty: fallback.difficulty,
    intensity: fallback.intensity,
    minutes: fallback.timeEstimateMin ?? 10,
  };
};

const activityTemplatesForEvent = (event: PairEventTypeModel): EventActivityTemplate[] => {
  if (event.category === 'relationship_milestone') {
    return [
      {
        id: 'event-best-moment',
        title: 'Лучший момент периода',
        description: 'Каждый называет один момент, который хочется сохранить, и одну маленькую просьбу на следующий период.',
        why: 'Помогает превратить дату в спокойную сверку, а не только в поздравление.',
        axis: ['communication'],
        archetype: 'dialogue',
        intent: 'celebrate',
        difficulty: 1,
        intensity: 1,
        minutes: 15,
      },
      {
        id: 'event-shared-marker',
        title: 'Один общий ориентир',
        description: 'Выберите одно небольшое совместное правило или ритуал на ближайшие две недели.',
        why: 'После значимой даты проще договориться о практичном следующем шаге.',
        axis: ['personalViews'],
        archetype: 'ritual',
        intent: 'improve',
        difficulty: 1,
        intensity: 1,
        minutes: 10,
      },
    ];
  }
  if (event.category === 'calendar_event') {
    return [
      {
        id: 'event-care-without-guessing',
        title: 'Жест внимания без угадывания',
        description: 'Каждый коротко говорит, какой формат внимания сейчас был бы уместен: время, помощь, прогулка или спокойный вечер.',
        why: 'Снижает давление и помогает выбрать действие, которое действительно подходит.',
        axis: ['communication'],
        archetype: 'dialogue',
        intent: 'celebrate',
        difficulty: 1,
        intensity: 1,
        minutes: 12,
      },
      {
        id: 'event-evening-plan',
        title: 'План вечера без давления',
        description: 'Согласуйте один простой формат на ближайшие дни: дома, прогулка, короткое свидание или общий отдых.',
        why: 'Событие становится поводом для конкретного теплого действия без обязательного сценария.',
        axis: ['psyche'],
        archetype: 'date',
        intent: 'celebrate',
        difficulty: 1,
        intensity: 1,
        minutes: 20,
      },
    ];
  }
  return [
    {
      id: 'event-soft-reconnect',
      title: 'Мягкое возвращение в контакт',
      description: 'Проведите 10-15 минут рядом без сложных тем: чай, короткая прогулка или спокойный разговор.',
      why: 'Когда есть сигнал усталости или паузы, лучше начать с простого контакта.',
      axis: event.axis?.length ? event.axis : ['psyche'],
      archetype: 'micro_habit',
      intent: 'improve',
      difficulty: 1,
      intensity: 1,
      minutes: 15,
    },
    {
      id: 'event-check-without-blame',
      title: 'Сверка без обвинений',
      description: 'Каждый отвечает на два вопроса: что сейчас помогает, и что стоит сделать легче.',
      why: 'Короткая сверка помогает увидеть следующий шаг без спора о том, кто прав.',
      axis: ['communication'],
      archetype: 'dialogue',
      intent: 'improve',
      difficulty: 1,
      intensity: 1,
      minutes: 12,
    },
  ];
};

const resolveMembers = async (
  members: [string, string]
): Promise<[Types.ObjectId, Types.ObjectId]> => {
  const users = await User.find({ id: { $in: members } }).lean<PairMemberUser[]>();
  const first = users.find((user) => user.id === members[0]);
  const second = users.find((user) => user.id === members[1]);
  if (!first || !second) {
    throw new DomainError({
      code: 'PAIR_MEMBERS_MISSING',
      status: 400,
      message: 'Pair members are missing',
    });
  }
  return [first._id, second._id];
};

const createActivitiesFromEvent = async (input: {
  pair: PairDoc;
  event: StoredEvent;
  now: Date;
  safetyVeto: boolean;
  createOffers: boolean;
  session?: ClientSession;
}): Promise<StoredActivity[]> => {
  const pairId = input.pair._id as Types.ObjectId;
  if (!input.createOffers) {
    await PairActivity.updateMany(
      {
        pairId,
        status: 'offered',
        'stateMeta.sourceMeta.eventId': String(input.event._id),
      },
      { $set: { status: 'cancelled' } }
    ).session(input.session ?? null);
    await PairEvent.updateOne(
      { _id: input.event._id },
      { $set: { generatedActivityIds: [] } }
    ).session(input.session ?? null);
    return [];
  }
  if (input.event.generatedActivityIds.length > 0) {
    const generated = await PairActivity.find({
      _id: { $in: input.event.generatedActivityIds },
    })
      .session(input.session ?? null)
      .lean<StoredActivity[]>();
    const ineligibleIds = generated
      .filter(
        (activity) =>
          hasP0SensitiveActivityAxis(activity.axis) ||
          !isActivityEligibleForSafetyState(activity, input.safetyVeto)
      )
      .map((activity) => activity._id);
    if (ineligibleIds.length > 0) {
      await PairActivity.updateMany(
        { _id: { $in: ineligibleIds }, status: 'offered' },
        { $set: { status: 'cancelled' } }
      ).session(input.session ?? null);
    }
  }

  const templates = (input.safetyVeto
    ? [safetyEventActivityTemplate()]
    : activityTemplatesForEvent(input.event)
  )
    .filter((template) => !hasP0SensitiveActivityAxis(template.axis))
    .slice(0, input.event.actionPolicy.maxGeneratedActivities);
  const created: StoredActivity[] = [];
  const missingTemplates: EventActivityTemplate[] = [];
  for (const template of templates) {
    const templateId =
      template.canonicalTemplateId ??
      `event-${input.event.type}-${template.id}`;
    const existing = await PairActivity.findOne({
      pairId,
      'stateMeta.sourceMeta.eventId': String(input.event._id),
      'stateMeta.templateId': templateId,
    })
      .session(input.session ?? null)
      .lean<StoredActivity | null>();
    if (existing) {
      created.push(existing);
      continue;
    }
    missingTemplates.push(template);
  }

  if (missingTemplates.length === 0) {
    await PairEvent.updateOne(
      { _id: input.event._id },
      { $set: { generatedActivityIds: created.map((activity) => activity._id) } }
    ).session(input.session ?? null);
    return created;
  }

  await Pair.updateOne(
    { _id: pairId },
    { $set: { updatedAt: new Date() } }
  ).session(input.session ?? null);

  const active = await PairActivity.findOne({ pairId, status: { $in: ACTIVE_ACTIVITY_STATUSES } })
    .select({ _id: 1 })
    .session(input.session ?? null)
    .lean<Pick<StoredActivity, '_id'> | null>();
  if (active) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Сначала завершите текущую активность, затем примите событие.',
    });
  }

  const offeredCount = await PairActivity.countDocuments({ pairId, status: 'offered' })
    .session(input.session ?? null);
  const slots = Math.max(0, 3 - offeredCount);
  if (slots === 0) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Too many active or offered activities',
    });
  }

  const members = await resolveMembers(input.pair.members as [string, string]);
  for (const template of missingTemplates.slice(0, slots)) {
    const templateId =
      template.canonicalTemplateId ??
      `event-${input.event.type}-${template.id}`;

    const [activity] = await PairActivity.create([{
      pairId,
      members,
      intent: template.intent,
      archetype: template.archetype,
      axis: template.axis,
      facetsTarget: [],
      title: { ru: template.title, en: template.title },
      description: { ru: template.description, en: template.description },
      why: input.safetyVeto
        ? { ru: template.why, en: template.why }
        : {
            ru: `${input.event.why.ru} ${template.why}`.trim(),
            en: `${input.event.why.en} ${template.why}`.trim(),
          },
      mode: 'together',
      sync: template.archetype === 'micro_habit' ? 'async' : 'sync',
      difficulty: template.difficulty,
      intensity: template.intensity,
      timeEstimateMin: template.minutes,
      location: 'any',
      materials: [],
      offeredAt: input.now,
      dueAt: addDays(input.now, 3),
      cooldownDays: 14,
      requiresConsent: false,
      status: 'offered',
      stateMeta: {
        templateId,
        source: input.event.category,
        sourceMeta: {
          trigger: 'pair_event',
          eventId: String(input.event._id),
          eventKey: input.event.key,
          eventType: input.event.type,
          eventCategory: input.event.category,
          eventDate: input.event.eventDate?.toISOString(),
          weekKey: input.event.source.weekKey,
          axis: input.event.axis?.[0],
          severity: input.event.severity,
          decisionVersion: 'activity-decision-v1',
        },
        primaryReason: input.event.type,
        axis: input.event.axis?.[0],
        severity: input.event.severity,
        weekKey: input.event.source.weekKey,
        decisionVersion: 'activity-decision-v1',
        assignedMemberIds: members.map(String),
        apiSource: 'pairs.events.accept',
      },
      checkIns: [],
      effect: template.axis.map((axis) => ({ axis, baseDelta: 0.04, target: 'both' })),
      fatigueDeltaOnComplete: template.intent === 'celebrate' ? -0.04 : 0.02,
      readinessDeltaOnComplete: template.intent === 'celebrate' ? 0.08 : 0.05,
      createdBy: 'system',
    }], { session: input.session });
    created.push(activity.toObject() as StoredActivity);
  }

  await PairEvent.updateOne(
    { _id: input.event._id },
    { $set: { generatedActivityIds: created.map((activity) => activity._id) } }
  ).session(input.session ?? null);
  return created;
};

const findEventForMutation = async (
  pairId: Types.ObjectId,
  eventId: string,
  session?: ClientSession
): Promise<StoredEvent> => {
  if (!Types.ObjectId.isValid(eventId)) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'event not found',
    });
  }
  const event = await PairEvent.findOne({ _id: eventId, pairId })
    .session(session ?? null)
    .lean<StoredEvent | null>();
  if (!event) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'event not found',
    });
  }
  return event;
};

const assertEventCanBeAccepted = (event: StoredEvent, now: Date): void => {
  if (!eventCanBeAccepted(event, now)) {
    throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be accepted' });
  }
};

const assertEventCanBeDeclined = (event: StoredEvent, now: Date): void => {
  if (!eventCanBeDeclined(event, now)) {
    throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be declined' });
  }
};

const assertEventCanBeSnoozed = (event: StoredEvent, now: Date): void => {
  if (!eventCanBeSnoozed(event, now)) {
    throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be snoozed' });
  }
};

export const pairEventService = {
  async refreshPairEvents(input: RefreshPairEventsInput): Promise<PairEventDTO[]> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const now = input.now ?? new Date();

    if (pair.status !== 'ended') {
      const ruleInput = await loadRuleInput({ pair, currentUserId: input.currentUserId, now });
      await upsertCandidates({
        pairId,
        candidates: buildPairEventCandidates(ruleInput),
        now,
      });
    }
    await refreshExpiredAndCompleted(pairId, now);

    if (pair.status === 'ended' && input.include !== 'all') return [];
    const events = await findVisibleEvents(pairId, input.include ?? 'active');
    const safetyVeto = await isPairSafetyVetoActive(String(pairId));
    return events
      .filter((event) => eventEligibleForPairProjection(event, safetyVeto))
      .map(toPairEventDTO);
  },

  async acceptEvent(input: PairEventMutationInput): Promise<{
    event: PairEventDTO;
    activities: PairActivityDTO[];
  }> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (pair.status !== 'active') {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Пара на паузе. Событие можно будет принять после возобновления пары.',
      });
    }

    const now = input.now ?? new Date();
    const pairId = pair._id as Types.ObjectId;
    const safetyVeto = await isPairSafetyVetoActive(String(pairId));
    let updated: StoredEvent | null = null;
    let activities: StoredActivity[] = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const event = await findEventForMutation(pairId, input.eventId, session);
        assertEventEligibleForPairProjection(event, safetyVeto);
        assertEventCanBeAccepted(event, now);

        const accepted = await PairEvent.findOneAndUpdate(
          { _id: event._id, pairId, status: { $in: [...ACCEPTABLE_EVENT_STATUSES, 'accepted'] } },
          { $set: { status: 'accepted', acceptedAt: event.acceptedAt ?? now } },
          { new: true, session }
        ).lean<StoredEvent | null>();
        if (!accepted) {
          throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be accepted' });
        }

        activities = await createActivitiesFromEvent({
          pair,
          event: accepted,
          now,
          safetyVeto,
          createOffers: false,
          session,
        });
        updated = await PairEvent.findById(event._id)
          .session(session)
          .lean<StoredEvent | null>();
        if (!updated) {
          throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'event not found' });
        }
      });
    } finally {
      await session.endSession();
    }

    if (!updated) {
      throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'event not found' });
    }
    const currentSafetyVeto = await isPairSafetyVetoActive(String(pairId));
    assertEventEligibleForPairProjection(updated, currentSafetyVeto);
    const projectedActivities = activities.filter(
      (activity) =>
        !hasP0SensitiveActivityAxis(activity.axis) &&
        isActivityEligibleForSafetyState(activity, currentSafetyVeto)
    );
    return {
      event: toPairEventDTO(updated),
      activities: projectedActivities.map((activity) =>
        toPairActivityDTO(activity, { includeAnswers: false })
      ),
    };
  },

  async declineEvent(input: PairEventMutationInput): Promise<{ event: PairEventDTO }> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const event = await findEventForMutation(pairId, input.eventId);
    assertEventEligibleForPairProjection(
      event,
      await isPairSafetyVetoActive(String(pairId))
    );
    const now = input.now ?? new Date();
    assertEventCanBeDeclined(event, now);
    const updated = await PairEvent.findOneAndUpdate(
      { _id: event._id, pairId, status: { $in: DECLINABLE_EVENT_STATUSES } },
      { $set: { status: 'declined', declinedAt: now } },
      { new: true }
    ).lean<StoredEvent | null>();
    if (!updated) {
      throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be declined' });
    }
    return { event: toPairEventDTO(updated) };
  },

  async snoozeEvent(input: SnoozePairEventInput): Promise<{ event: PairEventDTO }> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const event = await findEventForMutation(pairId, input.eventId);
    assertEventEligibleForPairProjection(
      event,
      await isPairSafetyVetoActive(String(pairId))
    );
    const now = input.now ?? new Date();
    assertEventCanBeSnoozed(event, now);
    const snoozedUntil = addDays(now, input.days ?? 3);
    if (event.expiresAt && snoozedUntil > event.expiresAt) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Snooze would exceed event window',
      });
    }
    const updated = await PairEvent.findOneAndUpdate(
      { _id: event._id, pairId, status: { $in: SNOOZABLE_EVENT_STATUSES } },
      { $set: { status: 'snoozed', snoozedUntil } },
      { new: true }
    ).lean<StoredEvent | null>();
    if (!updated) {
      throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be snoozed' });
    }
    return { event: toPairEventDTO(updated) };
  },

  async listHistoricalForPair(pairId: string): Promise<PairEventDTO[]> {
    await connectToDatabase();
    if (!Types.ObjectId.isValid(pairId)) return [];
    const pair = await Pair.findById(pairId).select({ _id: 1 }).lean<{ _id: Types.ObjectId } | null>();
    if (!pair) return [];
    const events = await findVisibleEvents(pair._id as Types.ObjectId, 'all');
    const safetyVeto = await isPairSafetyVetoActive(String(pair._id));
    return events
      .filter((event) => eventEligibleForPairProjection(event, safetyVeto))
      .map(toPairEventDTO);
  },
};
