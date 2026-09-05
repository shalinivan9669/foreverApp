import mongoose, { Types, type ClientSession, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairEvent, type PairEventStatus, type PairEventType, type PairEventTypeModel } from '@/models/PairEvent';
import { toPairActivityDTO, toPairEventDTO, type PairActivityDTO, type PairEventDTO } from '@/lib/dto';
import {
  weeklyCycleService,
  weeklyCycleKeyForDate,
  type CurrentWeeklyCycleDTO,
} from '@/domain/services/weeklyCycle.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import {
  hasEligibleActivityFactorBinding,
} from '@/domain/services/activityEligibility.service';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { PairWorkspace } from '@/models/PairWorkspace';
import { DEFAULT_SHARED_LIFE_SETTINGS, localDateSchema, type SharedLifeSettings } from '@/lib/contracts/sharedLife';
import { nextCalendarOccurrence } from '@/domain/model/sharedLife/calendar';

type PairDoc = HydratedDocument<PairType>;
type StoredEvent = PairEventTypeModel & { _id: Types.ObjectId };
type StoredActivity = PairActivityType & { _id: Types.ObjectId };
type PairMemberUser = UserType & { _id: Types.ObjectId };

type LocalText = { ru: string; en: string };

export type PairEventCandidate = Omit<
  PairEventTypeModel,
  'pairId' | 'generatedActivityIds' | 'createdAt' | 'updatedAt'
>;

export type PairEventWeeklyProjection = {
  cycleKey: string;
  bothSubmitted: boolean;
  dataStatus: CurrentWeeklyCycleDTO['pair']['dataStatus'];
  signals: CurrentWeeklyCycleDTO['pair']['signals'];
};

export type PairEventRuleInput = {
  pairId: string;
  pairStatus: PairType['status'];
  /** Legacy callers may provide it; event rules deliberately ignore app join time. */
  pairCreatedAt?: Date;
  settings?: SharedLifeSettings;
  weekly?: PairEventWeeklyProjection;
  hasCurrentActivity: boolean;
  latestFinalActivity?: {
    id: string;
    status: Extract<PairActivityType['status'], 'completed_success' | 'completed_partial' | 'failed'>;
  };
  completedActivityCountLast14Days: number;
  now: Date;
};

export type RefreshPairEventsInput = {
  pairId: string;
  currentUserId: string;
  include?: 'active' | 'all';
  now?: Date;
};

export type PairEventReliabilityTestHooks = {
  beforeTransactionalPairGuard?: (candidateCount: number) => Promise<void>;
  beforeMutationTransactionalPairGuard?: () => Promise<void>;
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
  'awaiting_feedback',
  'awaiting_checkin',
];
const FINAL_ACTIVITY_STATUSES: PairActivityType['status'][] = [
  'completed_success',
  'completed_partial',
  'failed',
  'cancelled',
  'expired',
];

const MAX_EVENT_TARGET_FACTORS = 4;

export const isPairEventFactorBindingEligible = (input: {
  factorRegistryVersion?: number;
  targetFactorKeys?: readonly string[];
}): boolean => {
  if (input.factorRegistryVersion !== MVP_FACTOR_REGISTRY.registryVersion) {
    return false;
  }
  const targetFactorKeys = input.targetFactorKeys;
  if (
    !Array.isArray(targetFactorKeys) ||
    targetFactorKeys.length === 0 ||
    targetFactorKeys.length > MAX_EVENT_TARGET_FACTORS ||
    new Set(targetFactorKeys).size !== targetFactorKeys.length
  ) {
    return false;
  }
  return targetFactorKeys.every((factorKey) => {
    const factor = MVP_FACTOR_REGISTRY.factors.find(
      (candidate) => candidate.key === factorKey
    );
    return Boolean(
      factor &&
        factor.contexts.includes('COMMITTED_RELATIONSHIP') &&
        factor.privacyClass !== 'SENSITIVE' &&
        factor.privacyClass !== 'MATCHING_ONLY'
    );
  });
};

const eventEligibleForPairProjection = (
  event: Pick<
    PairEventTypeModel,
    'factorRegistryVersion' | 'targetFactorKeys'
  >
): boolean => isPairEventFactorBindingEligible(event);

const assertEventEligibleForPairProjection = (
  event: Pick<
    PairEventTypeModel,
    'factorRegistryVersion' | 'targetFactorKeys'
  >
): void => {
  if (!eventEligibleForPairProjection(event)) {
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

const addUtcMonths = (date: Date, months: number): Date => {
  const targetMonth = utcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  return new Date(`${nextCalendarOccurrence(dateKey(date), 'MONTHLY', dateKey(targetMonth))}T00:00:00.000Z`);
};

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

type PairEventActionKey =
  | 'action.gentleThreeMinuteCheckIn'
  | 'action.repairConversation'
  | 'action.householdRoleMap';

const targetFactorKeysForAction = (
  actionKey: PairEventActionKey
): string[] => {
  const action = MVP_FACTOR_REGISTRY.actions.find(
    (candidate) => candidate.key === actionKey
  );
  if (!action) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Canonical pair event action is unavailable',
    });
  }
  const targetFactorKeys = [...action.targetFactors];
  if (
    !isPairEventFactorBindingEligible({
      factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      targetFactorKeys,
    })
  ) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Canonical pair event action is not privacy eligible',
    });
  }
  return targetFactorKeys;
};

const baseEvent = (input: {
  pairId: string;
  type: PairEventType;
  category: PairEventCandidate['category'];
  eventDate?: Date;
  windowStart: Date;
  windowEnd: Date;
  priority: 1 | 2 | 3;
  severity?: 1 | 2 | 3;
  targetFactorKeys: readonly string[];
  source: PairEventCandidate['source'];
  text: { title: LocalText; description: LocalText; why: LocalText };
  maxGeneratedActivities?: 1 | 2 | 3;
}): PairEventCandidate => {
  const targetFactorKeys = [...input.targetFactorKeys];
  if (
    !isPairEventFactorBindingEligible({
      factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      targetFactorKeys,
    })
  ) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Pair event factor binding is invalid',
    });
  }
  return {
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
    factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    targetFactorKeys,
    source: input.source,
    actionPolicy: {
      canAccept: true,
      canDecline: true,
      canSnooze: true,
      maxGeneratedActivities: input.maxGeneratedActivities ?? 2,
    },
  };
};

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
  const start = localDateSchema.safeParse(input.settings?.relationshipStartDate);
  if (!start.success) return [];
  // Pair.createdAt records joining the app, never the start of a relationship.
  const createdAt = new Date(`${start.data}T00:00:00.000Z`);
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
      targetFactorKeys: targetFactorKeysForAction(
        'action.gentleThreeMinuteCheckIn'
      ),
      source: { kind: 'pair_lifecycle', date: createdAt },
      text: eventText(milestoneTexts[type]),
      maxGeneratedActivities: 2,
    });
  });

  const yearsTogether = input.now.getUTCFullYear() - createdAt.getUTCFullYear();
  const anniversaryYears = [yearsTogether, yearsTogether + 1].filter((year) => year >= 1);
  for (const year of anniversaryYears) {
    const eventDate = new Date(`${nextCalendarOccurrence(start.data, 'YEARLY', `${createdAt.getUTCFullYear() + year}-01-01`)}T00:00:00.000Z`);
    items.push(
      baseEvent({
        pairId: input.pairId,
        type: 'anniversary',
        category: 'relationship_milestone',
        eventDate,
        windowStart: addDays(eventDate, -7),
        windowEnd: addDays(eventDate, 7),
        priority: 2,
        targetFactorKeys: targetFactorKeysForAction(
          'action.gentleThreeMinuteCheckIn'
        ),
        source: { kind: 'pair_lifecycle', date: createdAt },
        text: eventText(milestoneTexts.anniversary),
        maxGeneratedActivities: 3,
      })
    );
  }

  return items.filter((event) => inHorizon(event, input.now));
};

const calendarEvents = (input: PairEventRuleInput): PairEventCandidate[] => {
  if (!(input.settings ?? DEFAULT_SHARED_LIFE_SETTINGS).holidaysEnabled) return [];
  const year = input.now.getUTCFullYear();
  // partner_birthday is reserved for a future privacy-reviewed birthday data model.
  const definitions = [
    {
      type: 'valentines_day' as const,
      eventDate: utcDate(year, 1, 14),
      windowStart: utcDate(year, 1, 7),
      windowEnd: utcDate(year, 1, 15),
      actionKey: 'action.gentleThreeMinuteCheckIn' as const,
    },
    {
      type: 'march_8' as const,
      eventDate: utcDate(year, 2, 8),
      windowStart: utcDate(year, 2, 1),
      windowEnd: utcDate(year, 2, 9),
      actionKey: 'action.gentleThreeMinuteCheckIn' as const,
    },
    {
      type: 'new_year' as const,
      eventDate: utcDate(year, 11, 31),
      windowStart: utcDate(year, 11, 25),
      windowEnd: utcDate(year + 1, 0, 3),
      actionKey: 'action.gentleThreeMinuteCheckIn' as const,
    },
    {
      type: 'new_year' as const,
      eventDate: utcDate(year - 1, 11, 31),
      windowStart: utcDate(year - 1, 11, 25),
      windowEnd: utcDate(year, 0, 3),
      actionKey: 'action.gentleThreeMinuteCheckIn' as const,
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
        targetFactorKeys: targetFactorKeysForAction(definition.actionKey),
        source: { kind: 'calendar_rule', date: definition.eventDate },
        text: eventText(calendarTexts[definition.type]),
        maxGeneratedActivities: 2,
      })
    )
    .filter((event) => inHorizon(event, input.now));
};

const behavioralEvents = (input: PairEventRuleInput): PairEventCandidate[] => {
  const items: PairEventCandidate[] = [];
  const cycleKey = input.weekly?.cycleKey ?? weeklyCycleKeyForDate(input.now);
  if (!input.hasCurrentActivity && input.completedActivityCountLast14Days === 0) {
    items.push({
      ...baseEvent({
        pairId: input.pairId,
        type: 'inactive_pair',
        category: 'behavioral_event',
        windowStart: addDays(input.now, -1),
        windowEnd: addDays(input.now, 13),
        priority: 2,
        targetFactorKeys: targetFactorKeysForAction(
          'action.gentleThreeMinuteCheckIn'
        ),
        source: { kind: 'activity_history', cycleKey },
        text: eventText({
          title: 'Давно не было совместного действия',
          description: 'Лучше не начинать с тяжелого разговора. Подойдет короткая легкая активность.',
          why: 'Регулярность важнее редких больших рывков.',
        }),
      }),
      key: `${input.pairId}:inactive_pair:${cycleKey}`,
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
        targetFactorKeys: targetFactorKeysForAction(
          'action.gentleThreeMinuteCheckIn'
        ),
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
  const weeklySignalsReady =
    weekly?.dataStatus === 'ENOUGH' &&
    weekly.bothSubmitted &&
    weekly.signals.length === 4;
  if (weekly && weeklySignalsReady) {
    const signal = (key: CurrentWeeklyCycleDTO['pair']['signals'][number]['key']) =>
      weekly.signals.find((candidate) => candidate.key === key);
    const recovery = signal('recovery');
    const tension = signal('tension');
    const connection = signal('connection');
    const resource = signal('resource');

    if (recovery?.status === 'LOW') {
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'weekly_overload_recovery',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 1,
          severity: 2,
          targetFactorKeys: targetFactorKeysForAction(
            'action.gentleThreeMinuteCheckIn'
          ),
          source: { kind: 'weekly_pair_state', cycleKey },
          text: eventText({
            title: 'Неделя с высокой перегрузкой',
            description: 'Сейчас лучше не перегружать пару. Подойдет мягкий формат восстановления.',
            why: 'При высокой перегрузке тяжелые разговоры часто дают хуже результат.',
          }),
        }),
        key: `${input.pairId}:weekly_overload_recovery:${cycleKey}`,
      });
    }

    if (tension?.status === 'HIGH' || tension?.status === 'MIXED') {
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'weekly_tension_support',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 1,
          severity: tension.status === 'HIGH' ? 3 : 2,
          targetFactorKeys: targetFactorKeysForAction(
            'action.gentleThreeMinuteCheckIn'
          ),
          source: { kind: 'weekly_pair_state', cycleKey },
          text: eventText({
            title: 'Неделе нужна мягкая сверка',
            description: 'Лучше начать с короткой сверки без обвинений и попытки сразу все решить.',
            why: 'Общий сигнал напряжения — повод выбрать безопасный формат разговора, а не искать виноватого.',
          }),
        }),
        key: `${input.pairId}:weekly_tension_support:${cycleKey}`,
      });
    }

    if (
      connection?.status === 'STEADY' &&
      tension?.status === 'LOW' &&
      recovery?.status === 'STEADY' &&
      resource?.status === 'STEADY'
    ) {
      items.push({
        ...baseEvent({
          pairId: input.pairId,
          type: 'weekly_success_celebration',
          category: 'behavioral_event',
          windowStart: addDays(input.now, -1),
          windowEnd: addDays(input.now, 7),
          priority: 3,
          targetFactorKeys: targetFactorKeysForAction(
            'action.gentleThreeMinuteCheckIn'
          ),
          source: { kind: 'weekly_pair_state', cycleKey },
          text: eventText({
            title: 'Хорошая неделя для пары',
            description: 'Можно закрепить удачный ритм коротким приятным действием.',
            why: 'Сильные недели тоже стоит замечать, а не только чинить проблемы.',
          }),
        }),
        key: `${input.pairId}:weekly_success_celebration:${cycleKey}`,
      });
    }
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

export const isPairEventEnabledBySettings = (
  event: Pick<PairEventTypeModel, 'category' | 'source'>,
  settings: SharedLifeSettings
): boolean => {
  if (event.category === 'calendar_event') return settings.holidaysEnabled;
  if (event.category !== 'relationship_milestone') return true;
  const start = localDateSchema.safeParse(settings.relationshipStartDate);
  return start.success && Boolean(event.source.date && dateKey(event.source.date) === start.data);
};

const loadEventSettings = async (pairId: Types.ObjectId, session?: ClientSession): Promise<SharedLifeSettings> => {
  const workspace = await PairWorkspace.findById(String(pairId)).select({ settings: 1 })
    .session(session ?? null).lean<{ settings: SharedLifeSettings } | null>();
  return workspace?.settings ?? { ...DEFAULT_SHARED_LIFE_SETTINGS };
};

const expireDisabledProposals = async (pairId: Types.ObjectId, settings: SharedLifeSettings, session: ClientSession): Promise<void> => {
  const pending = await PairEvent.find({ pairId, status: { $in: ACCEPTABLE_EVENT_STATUSES } })
    .session(session).lean<StoredEvent[]>();
  const disabledIds = pending.filter((event) => !isPairEventEnabledBySettings(event, settings)).map((event) => event._id);
  if (disabledIds.length) await PairEvent.updateMany(
    { _id: { $in: disabledIds }, status: { $in: ACCEPTABLE_EVENT_STATUSES } },
    { $set: { status: 'expired' } }, { session }
  );
};

const assertEventSettingsPermitMutation = async (event: StoredEvent, pairId: Types.ObjectId, session?: ClientSession): Promise<void> => {
  if (!isPairEventEnabledBySettings(event, await loadEventSettings(pairId, session))) {
    throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Настройки пары изменились. Обновите список событий.' });
  }
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

const fenceMutablePairForEventMutation = async (input: {
  pairId: Types.ObjectId;
  currentUserId: string;
  allowedStatuses: readonly PairType['status'][];
  session: ClientSession;
}): Promise<boolean> => {
  const pair = await Pair.findOneAndUpdate(
    {
      _id: input.pairId,
      members: input.currentUserId,
      status: { $in: [...input.allowedStatuses] },
    },
    { $inc: { lifecycleRevision: 1 } },
    { new: false, session: input.session }
  )
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  return Boolean(pair);
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
  session?: ClientSession;
}): Promise<void> => {
  for (const candidate of input.candidates) {
    const existing = await PairEvent.findOne({ pairId: input.pairId, key: candidate.key })
      .session(input.session ?? null)
      .lean<StoredEvent | null>();
    // The confirmed event is history: configuration changes must not rewrite it.
    if (existing && TERMINAL_EVENT_STATUSES.includes(existing.status)) continue;
    const status = resolvePairEventStatus(candidate, existing, input.now);
    const setPayload: Partial<PairEventTypeModel> = {
      category: candidate.category,
      type: candidate.type,
      title: candidate.title,
      description: candidate.description,
      why: candidate.why,
      eventDate: candidate.eventDate,
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      expiresAt: candidate.expiresAt,
      priority: candidate.priority,
      severity: candidate.severity,
      factorRegistryVersion: candidate.factorRegistryVersion,
      targetFactorKeys: candidate.targetFactorKeys,
      source: candidate.source,
      actionPolicy: candidate.actionPolicy,
      status,
    };
    await PairEvent.updateOne(
      { pairId: input.pairId, key: candidate.key },
      {
        $setOnInsert: {
          pairId: input.pairId,
          key: candidate.key,
          generatedActivityIds: [],
        },
        $set: setPayload,
      },
      {
        upsert: true,
        runValidators: true,
        ...(input.session ? { session: input.session } : {}),
      }
    );
  }
};

const refreshExpiredAndCompleted = async (
  pairId: Types.ObjectId,
  now: Date,
  session?: ClientSession
): Promise<void> => {
  await PairEvent.updateMany(
    {
      pairId,
      expiresAt: { $lt: now },
      status: { $nin: ['accepted', 'completed', 'declined'] },
    },
    { $set: { status: 'expired' } },
    session ? { session } : undefined
  );

  const accepted = await PairEvent.find({
    pairId,
    status: 'accepted',
    generatedActivityIds: { $exists: true, $ne: [] },
  })
    .session(session ?? null)
    .lean<StoredEvent[]>();
  for (const event of accepted) {
    const activities = await PairActivity.find({ _id: { $in: event.generatedActivityIds } })
      .select({ status: 1 })
      .session(session ?? null)
      .lean<Array<Pick<StoredActivity, '_id' | 'status'>>>();
    if (
      activities.length === event.generatedActivityIds.length &&
      activities.every((activity) => FINAL_ACTIVITY_STATUSES.includes(activity.status))
    ) {
      await PairEvent.updateOne(
        { _id: event._id },
        { $set: { status: 'completed', completedAt: now } },
        session ? { session } : undefined
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
  const [currentWeekly, current, latestFinal, completedRecent] = await Promise.all([
    weeklyCycleService.current({
      pair: input.pair,
      currentUserId: input.currentUserId,
      now: input.now,
    }),
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
    weekly: {
      cycleKey: currentWeekly.cycleKey,
      bothSubmitted: currentWeekly.pair.bothSubmitted,
      dataStatus: currentWeekly.pair.dataStatus,
      signals: currentWeekly.pair.signals,
    },
    hasCurrentActivity: Boolean(current),
    latestFinalActivity: latestFinal
      ? {
          id: String(latestFinal._id),
          status: latestFinal.status as 'completed_success' | 'completed_partial' | 'failed',
        }
      : undefined,
    completedActivityCountLast14Days: completedRecent,
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
  canonicalTemplateId: string;
};

const canonicalTemplateForEvent = (
  eventTemplate: EventActivityTemplate,
  event: PairEventTypeModel
) => {
  const canonical = SYSTEM_ACTIVITY_TEMPLATES.find(
    (template) => String(template._id) === eventTemplate.canonicalTemplateId
  );
  if (!canonical || !hasEligibleActivityFactorBinding(canonical)) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Canonical pair event activity is unavailable',
    });
  }
  if (
    canonical.targetFactorKeys.some(
      (factorKey) => !event.targetFactorKeys.includes(factorKey)
    )
  ) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Pair event activity does not match its factor targets',
    });
  }
  return canonical;
};

const activityTemplatesForEvent = (event: PairEventTypeModel): EventActivityTemplate[] => {
  if (event.category === 'relationship_milestone') {
    return [
      {
        id: 'event-best-moment',
        canonicalTemplateId: 'system-resource-phone-free',
      },
      {
        id: 'event-shared-marker',
        canonicalTemplateId: 'system-resource-relief',
      },
    ];
  }
  if (event.category === 'calendar_event') {
    return [
      {
        id: 'event-care-without-guessing',
        canonicalTemplateId: 'system-resource-phone-free',
      },
      {
        id: 'event-evening-plan',
        canonicalTemplateId: 'system-resource-relief',
      },
    ];
  }
  if (
    event.type === 'failed_activity_recovery' ||
    event.type === 'weekly_tension_support'
  ) {
    return [
      {
        id: 'event-check-without-blame',
        canonicalTemplateId: 'system-resource-phone-free',
      },
    ];
  }
  return [
    {
      id: 'event-soft-reconnect',
      canonicalTemplateId:
        event.type === 'weekly_success_celebration'
          ? 'system-resource-phone-free'
          : 'system-resource-relief',
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
  session?: ClientSession;
}): Promise<StoredActivity[]> => {
  const pairId = input.pair._id as Types.ObjectId;
  if (input.event.generatedActivityIds.length > 0) {
    const generated = await PairActivity.find({
      _id: { $in: input.event.generatedActivityIds },
    })
      .session(input.session ?? null)
      .lean<StoredActivity[]>();
    const ineligibleIds = generated
      .filter((activity) => !hasEligibleActivityFactorBinding(activity))
      .map((activity) => activity._id);
    if (ineligibleIds.length > 0) {
      await PairActivity.updateMany(
        { _id: { $in: ineligibleIds }, status: 'offered' },
        { $set: { status: 'cancelled' } }
      ).session(input.session ?? null);
    }
  }

  const templates = activityTemplatesForEvent(input.event)
    .slice(0, input.event.actionPolicy.maxGeneratedActivities);
  const created: StoredActivity[] = [];
  const missingTemplates: EventActivityTemplate[] = [];
  for (const template of templates) {
    const templateId = template.canonicalTemplateId;
    const existing = await PairActivity.findOne({
      pairId,
      'stateMeta.sourceMeta.eventId': String(input.event._id),
      'stateMeta.templateId': templateId,
    })
      .sort({ createdAt: -1 })
      .session(input.session ?? null)
      .lean<StoredActivity | null>();
    if (
      existing &&
      hasEligibleActivityFactorBinding(existing)
    ) {
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
    const canonicalTemplate = canonicalTemplateForEvent(template, input.event);
    const templateId = template.canonicalTemplateId;

    const [activity] = await PairActivity.create([{
      pairId,
      members,
      intent: canonicalTemplate.intent,
      archetype: canonicalTemplate.archetype,
      actionDefinition: canonicalTemplate.actionDefinition,
      targetFactorKeys: canonicalTemplate.targetFactorKeys,
      title: { ...canonicalTemplate.title },
      description: { ...canonicalTemplate.description },
      why: {
        ru: `${input.event.why.ru} ${canonicalTemplate.why.ru}`.trim(),
        en: `${input.event.why.en} ${canonicalTemplate.why.en}`.trim(),
      },
      mode: canonicalTemplate.mode,
      sync: canonicalTemplate.sync,
      difficulty: canonicalTemplate.difficulty,
      intensity: canonicalTemplate.intensity,
      timeEstimateMin: canonicalTemplate.timeEstimateMin,
      location: canonicalTemplate.location,
      materials: [...(canonicalTemplate.materials ?? [])],
      offeredAt: input.now,
      dueAt: addDays(input.now, 3),
      cooldownDays: canonicalTemplate.cooldownDays,
      requiresConsent: canonicalTemplate.requiresConsent,
      visibility: canonicalTemplate.visibility,
      status: 'offered',
      lifecycleVersion: 'activity-lifecycle-v3',
      feedbackSchemaVersion: 'activity-feedback-v2',
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
          cycleKey: input.event.source.cycleKey,
          severity: input.event.severity,
          actionKey: canonicalTemplate.actionDefinition.key,
          factorKey: canonicalTemplate.targetFactorKeys[0],
          registryVersion: canonicalTemplate.actionDefinition.registryVersion,
          decisionVersion: 'activity-decision-v2',
        },
        primaryReason: input.event.type,
        severity: input.event.severity,
        cycleKey: input.event.source.cycleKey,
        decisionVersion: 'activity-decision-v2',
        assignedMemberIds: members.map(String),
        apiSource: 'pairs.events.accept',
      },
      checkIns: canonicalTemplate.checkIns,
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
  async assertMutationAccess(input: PairEventMutationInput & { action: 'accept' | 'decline' | 'snooze' }): Promise<{ pairId: string; eventId: string }> {
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    if (input.action === 'accept' && pair.status !== 'active') {
      throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Пара на паузе. Принять событие можно после возобновления.' });
    }
    const pairId = pair._id as Types.ObjectId;
    const event = await findEventForMutation(pairId, input.eventId);
    assertEventEligibleForPairProjection(event);
    await assertEventSettingsPermitMutation(event, pairId);
    return { pairId: String(pairId), eventId: String(event._id) };
  },

  async refreshPairEvents(
    input: RefreshPairEventsInput,
    hooks: PairEventReliabilityTestHooks = {}
  ): Promise<PairEventDTO[]> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const now = input.now ?? new Date();

    if (pair.status === 'ended') return [];
    const ruleInput =
      pair.status === 'active'
        ? await loadRuleInput({
              pair,
              currentUserId: input.currentUserId,
              now,
            })
        : null;
    // Preliminary count is only a reliability hook; actual settings are read
    // after the Pair fence so concurrent workspace updates cannot revive offers.
    const preliminaryCount = ruleInput ? buildPairEventCandidates(ruleInput).length : 0;
    let settings = { ...DEFAULT_SHARED_LIFE_SETTINGS };
    let lifecycleFenced = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        lifecycleFenced = false;
        await hooks.beforeTransactionalPairGuard?.(preliminaryCount);
        if (
          !(await fenceMutablePairForEventMutation({
            pairId,
            currentUserId: input.currentUserId,
            allowedStatuses: [pair.status],
            session,
          }))
        ) {
          return;
        }
        settings = await loadEventSettings(pairId, session);
        await expireDisabledProposals(pairId, settings, session);
        if (ruleInput) {
          const candidates = buildPairEventCandidates({ ...ruleInput, settings });
          await upsertCandidates({ pairId, candidates, now, session });
        }
        await refreshExpiredAndCompleted(pairId, now, session);
        lifecycleFenced = true;
      });
    } finally {
      await session.endSession();
    }
    if (!lifecycleFenced) return [];

    const currentPair = await Pair.findById(pairId)
      .select({ status: 1 })
      .lean<Pick<PairType, 'status'> | null>();
    if (!currentPair || currentPair.status === 'ended') return [];
    const events = await findVisibleEvents(pairId, input.include ?? 'active');
    return events
      .filter(eventEligibleForPairProjection)
      .filter((event) => TERMINAL_EVENT_STATUSES.includes(event.status) || isPairEventEnabledBySettings(event, settings))
      .map(toPairEventDTO);
  },

  async acceptEvent(
    input: PairEventMutationInput,
    hooks: PairEventReliabilityTestHooks = {}
  ): Promise<{
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
    let updated: StoredEvent | null = null;
    let activities: StoredActivity[] = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await hooks.beforeMutationTransactionalPairGuard?.();
        if (
          !(await fenceMutablePairForEventMutation({
            pairId,
            currentUserId: input.currentUserId,
            allowedStatuses: ['active'],
            session,
          }))
        ) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Pair is no longer active',
          });
        }
        const event = await findEventForMutation(pairId, input.eventId, session);
        assertEventEligibleForPairProjection(event);
        await assertEventSettingsPermitMutation(event, pairId, session);
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
    assertEventEligibleForPairProjection(updated);
    const projectedActivities = activities.filter(
      (activity) => hasEligibleActivityFactorBinding(activity)
    );
    return {
      event: toPairEventDTO(updated),
      activities: projectedActivities.map((activity) =>
        toPairActivityDTO(activity, { includeAnswers: false })
      ),
    };
  },

  async declineEvent(
    input: PairEventMutationInput,
    hooks: PairEventReliabilityTestHooks = {}
  ): Promise<{ event: PairEventDTO }> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const now = input.now ?? new Date();
    let updated: StoredEvent | null = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await hooks.beforeMutationTransactionalPairGuard?.();
        if (
          !(await fenceMutablePairForEventMutation({
            pairId,
            currentUserId: input.currentUserId,
            allowedStatuses: ['active', 'paused'],
            session,
          }))
        ) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Pair is no longer mutable',
          });
        }
        const event = await findEventForMutation(pairId, input.eventId, session);
        assertEventEligibleForPairProjection(event);
        await assertEventSettingsPermitMutation(event, pairId, session);
        assertEventCanBeDeclined(event, now);
        updated = await PairEvent.findOneAndUpdate(
          { _id: event._id, pairId, status: { $in: DECLINABLE_EVENT_STATUSES } },
          { $set: { status: 'declined', declinedAt: now } },
          { new: true, session }
        ).lean<StoredEvent | null>();
      });
    } finally {
      await session.endSession();
    }
    if (!updated) {
      throw new DomainError({ code: 'STATE_CONFLICT', status: 409, message: 'Event cannot be declined' });
    }
    return { event: toPairEventDTO(updated) };
  },

  async snoozeEvent(
    input: SnoozePairEventInput,
    hooks: PairEventReliabilityTestHooks = {}
  ): Promise<{ event: PairEventDTO }> {
    await connectToDatabase();
    const pair = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pair._id as Types.ObjectId;
    const now = input.now ?? new Date();
    let updated: StoredEvent | null = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await hooks.beforeMutationTransactionalPairGuard?.();
        if (
          !(await fenceMutablePairForEventMutation({
            pairId,
            currentUserId: input.currentUserId,
            allowedStatuses: ['active', 'paused'],
            session,
          }))
        ) {
          throw new DomainError({
            code: 'STATE_CONFLICT',
            status: 409,
            message: 'Pair is no longer mutable',
          });
        }
        const event = await findEventForMutation(pairId, input.eventId, session);
        assertEventEligibleForPairProjection(event);
        await assertEventSettingsPermitMutation(event, pairId, session);
        assertEventCanBeSnoozed(event, now);
        const snoozedUntil = addDays(now, input.days ?? 3);
        if (event.expiresAt && snoozedUntil > event.expiresAt) {
          throw new DomainError({
            code: 'VALIDATION_ERROR',
            status: 400,
            message: 'Snooze would exceed event window',
          });
        }
        updated = await PairEvent.findOneAndUpdate(
          { _id: event._id, pairId, status: { $in: SNOOZABLE_EVENT_STATUSES } },
          { $set: { status: 'snoozed', snoozedUntil } },
          { new: true, session }
        ).lean<StoredEvent | null>();
      });
    } finally {
      await session.endSession();
    }
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
    const settings = await loadEventSettings(pair._id);
    const events = await findVisibleEvents(pair._id as Types.ObjectId, 'all');
    return events
      .filter(eventEligibleForPairProjection)
      .filter((event) => TERMINAL_EVENT_STATUSES.includes(event.status) || isPairEventEnabledBySettings(event, settings))
      .map(toPairEventDTO);
  },
};
