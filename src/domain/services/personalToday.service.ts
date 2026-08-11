import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { DomainError } from '@/domain/errors';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
} from '@/domain/model/snapshots/snapshots';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import {
  PersonalDailyCheckIn,
  type PersonalDailyCheckInType,
} from '@/models/PersonalDailyCheckIn';
import {
  PartnerSignal,
  type PartnerSignalTone,
  type PartnerSignalType,
} from '@/models/PartnerSignal';
import {
  weeklyCheckInService,
  type WeeklyCheckInDTO,
} from '@/domain/services/weeklyCheckIn.service';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import { materializeCurrentOwnerFactorSnapshots } from '@/domain/services/activityFactorRuntime.service';
import { fromStoredFactorValue } from '@/models/factorEngineSchemas';
import {
  resolveRelationshipLens,
  type RelationshipLens,
} from '@/domain/services/relationshipLens.service';
import {
  buildPersonalTodayFocus,
  buildPersonalTodayMetrics,
  personalTodayOverallDataStatus,
  type PersonalTodayFocus,
  type PersonalTodayMetrics,
  type PersonalTodaySource,
  type ProfilePersonalSignal,
  type WeeklyPersonalSignal,
} from '@/domain/services/personalTodayRules.service';
import { buildPersonalTodayCopy } from '@/domain/services/personalTodayCopy.service';

type DateFreshness = 'today' | 'stale' | 'weekly_fallback' | 'profile_fallback' | 'low_data';

type PersonalDailyCheckInRow = PersonalDailyCheckInType & {
  _id: Types.ObjectId;
};

type PartnerSignalRow = PartnerSignalType & {
  _id: Types.ObjectId;
};

type IncomingSender = Pick<UserType, 'id' | 'username' | 'avatar'>;

type UserForToday = UserType & {
  _id?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

export type IncomingPartnerSignalDTO = {
  id: string;
  from: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  text: string;
  tone: PartnerSignalTone;
  createdAt?: string;
};

export type PersonalTodayBuildInput = {
  currentUserId: string;
  dateKey?: string;
  timezoneOffsetMin?: number;
};

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDateKey = (value: string): boolean => dateKeyRegex.test(value);

export const localDateKey = (input: {
  now?: Date;
  timezoneOffsetMin?: number;
} = {}): string => {
  const now = input.now ?? new Date();
  const offset = input.timezoneOffsetMin ?? 0;
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
};

const dateFromDateKey = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);

const capitalize = (value: string): string =>
  value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

const formatDateLabel = (dateKey: string): string =>
  capitalize(
    new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(dateFromDateKey(dateKey))
  );

const pairIdVariants = (pairId: string): Array<string | Types.ObjectId> =>
  Types.ObjectId.isValid(pairId) ? [pairId, new Types.ObjectId(pairId)] : [pairId];

export const resolvePersonalTodayFreshness = (input: {
  hasDaily: boolean;
  hasWeekly: boolean;
  hasProfileData: boolean;
  dateKey: string;
  todayDateKey: string;
}): DateFreshness => {
  if (input.hasDaily) {
    return input.dateKey === input.todayDateKey ? 'today' : 'stale';
  }
  if (input.hasWeekly) return 'weekly_fallback';
  if (input.hasProfileData) return 'profile_fallback';
  return 'low_data';
};

export type ProfileFactorRow = Pick<
  IndividualFactorSnapshotType,
  | 'subjectId'
  | 'contextPairId'
  | 'projectionPurpose'
  | 'factorKey'
  | 'status'
  | 'value'
  | 'metrics'
  | 'revision'
  | 'calculatedAt'
  | 'versions'
  | 'effectiveFrom'
  | 'effectiveUntil'
>;

const MINIMUM_PROFILE_CONFIDENCE = 0.35;
const MINIMUM_PROFILE_FRESHNESS = 0.35;
const PROFILE_FACTOR_KEYS = [
  'wellbeing.current.readiness',
  'wellbeing.current.overload',
] as const;

export const ownerProfileSnapshotFilter = (input: {
  ownerId: string;
  pairId?: string;
}) => ({
  subjectId: input.ownerId,
  projectionPurpose: 'OWNER_PROFILE' as const,
  factorKey: { $in: [...PROFILE_FACTOR_KEYS] },
  ...(input.pairId
    ? { contextPairId: input.pairId }
    : { contextPairId: { $exists: false as const } }),
});

const latestProfileScalar = (
  snapshots: readonly ProfileFactorRow[],
  factorKey: 'wellbeing.current.readiness' | 'wellbeing.current.overload',
  effectiveAt: Date
): number | undefined => {
  const snapshot = snapshots
    .filter((candidate) => candidate.factorKey === factorKey)
    .sort(
      (left, right) =>
        right.calculatedAt.getTime() - left.calculatedAt.getTime() ||
        right.revision - left.revision
    )[0];
  if (
    !snapshot ||
    !snapshotVersionsMatchRegistry(
      snapshot.versions,
      MVP_FACTOR_REGISTRY.factors.find((factor) => factor.key === factorKey) ??
        (() => {
          throw new TypeError('CANONICAL_PROFILE_FACTOR_MISSING');
        })(),
      MVP_FACTOR_REGISTRY
    ) ||
    !isSnapshotEffectiveAt(snapshot, effectiveAt) ||
    snapshot.status !== 'AVAILABLE' ||
    snapshot.metrics.confidence < MINIMUM_PROFILE_CONFIDENCE ||
    snapshot.metrics.freshness < MINIMUM_PROFILE_FRESHNESS ||
    snapshot.metrics.evidenceCount < 1
  ) {
    return undefined;
  }
  try {
    const value = fromStoredFactorValue(snapshot.value);
    return value.kind === 'SCALAR' &&
      Number.isFinite(value.value) &&
      value.value >= 0 &&
      value.value <= 1
      ? value.value
      : undefined;
  } catch {
    return undefined;
  }
};

export const resolveProfilePersonalSignal = (input: {
  snapshots: readonly ProfileFactorRow[];
  ownerId: string;
  pairId?: string;
  effectiveAt?: Date;
}): ProfilePersonalSignal => {
  const snapshots = input.snapshots.filter(
    (snapshot) =>
      snapshot.subjectId === input.ownerId &&
      snapshot.projectionPurpose === 'OWNER_PROFILE' &&
      (input.pairId
        ? snapshot.contextPairId === input.pairId
        : snapshot.contextPairId === undefined)
  );
  const effectiveAt = input.effectiveAt ?? new Date();
  const readiness = latestProfileScalar(
    snapshots,
    'wellbeing.current.readiness',
    effectiveAt
  );
  const fatigue = latestProfileScalar(
    snapshots,
    'wellbeing.current.overload',
    effectiveAt
  );
  if (readiness !== undefined && fatigue !== undefined) {
    return {
      dataStatus: 'AVAILABLE',
      readiness,
      fatigue,
    };
  }
  if (snapshots.length === 0 || snapshots.every((snapshot) => snapshot.status === 'MISSING')) {
    return { dataStatus: 'MISSING' };
  }
  return { dataStatus: 'INSUFFICIENT' };
};

export const resolveOwnerWeeklySignal = (
  checkIn: Pick<WeeklyCheckInDTO, 'userId' | 'answers'> | null,
  ownerId: string
): WeeklyPersonalSignal | null => {
  if (checkIn?.userId !== ownerId) return null;
  const { readiness, fatigue, closeness, irritation, unresolvedTopic } =
    checkIn.answers;
  const isUnitInterval = (value: number): boolean =>
    Number.isFinite(value) && value >= 0 && value <= 1;
  if (
    !isUnitInterval(readiness) ||
    !isUnitInterval(fatigue) ||
    !isUnitInterval(closeness) ||
    !isUnitInterval(irritation)
  ) {
    return null;
  }
  return {
    readiness,
    fatigue,
    closeness,
    irritation,
    unresolvedTopic,
  };
};

const focusForSource = (input: {
  source: PersonalTodaySource;
  daily: PersonalDailyCheckInRow | null;
  weekly: WeeklyPersonalSignal | null;
  profile: ProfilePersonalSignal;
}): { metrics: PersonalTodayMetrics; focus: PersonalTodayFocus } => {
  if (input.daily) {
    const metrics = buildPersonalTodayMetrics({
      source: 'daily_checkin',
      answers: input.daily.answers,
    });
    return {
      metrics,
      focus: buildPersonalTodayFocus({
        source: 'daily_checkin',
        metrics,
      }),
    };
  }

  if (input.source === 'weekly_fallback' && input.weekly) {
    const metrics = buildPersonalTodayMetrics({
      source: 'weekly_fallback',
      weekly: input.weekly,
    });
    return {
      metrics,
      focus: buildPersonalTodayFocus({
        source: 'weekly_fallback',
        metrics,
        unresolvedTopic: input.weekly.unresolvedTopic,
      }),
    };
  }

  if (input.source === 'profile_fallback') {
    const metrics = buildPersonalTodayMetrics({
      source: 'profile_fallback',
      profile: input.profile,
    });
    return {
      metrics,
      focus: buildPersonalTodayFocus({
        source: 'profile_fallback',
        metrics,
      }),
    };
  }

  const metrics = buildPersonalTodayMetrics({
    source: 'low_data',
    resourceDataStatus:
      input.profile.dataStatus === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'MISSING',
  });
  return {
    metrics,
    focus: buildPersonalTodayFocus({
      source: 'low_data',
      metrics,
    }),
  };
};

const pairContextDTO = (
  pair: HydratedDocument<PairType> | null
): {
  hasPair: boolean;
  pairId?: string;
  status?: 'active' | 'paused';
  label: string;
} => {
  if (!pair || (pair.status !== 'active' && pair.status !== 'paused')) {
    return {
      hasPair: false,
      label: 'Пара пока не активна',
    };
  }
  return {
    hasPair: true,
    pairId: String(pair._id),
    status: pair.status,
    label:
      pair.status === 'paused'
        ? 'Пара на паузе'
        : 'Пара активна',
  };
};

export const sanitizeIncomingPartnerSignal = (input: {
  signal: PartnerSignalRow;
  sender: IncomingSender | null;
}): IncomingPartnerSignalDTO => ({
  id: String(input.signal._id),
  from: {
    id: input.signal.fromUserId,
    username: input.sender?.username ?? 'Партнёр',
    avatarUrl: input.sender
      ? toDiscordAvatarUrl(input.sender.id, input.sender.avatar)
      : null,
  },
  text: input.signal.text,
  // Legacy rows may contain a tone inferred from the sender's private check-in.
  // Only the explicitly confirmed text crosses the participant boundary.
  tone: 'neutral',
  createdAt: input.signal.createdAt?.toISOString(),
});

const findIncomingSignal = async (input: {
  currentUserId: string;
  pairId?: string;
  dateKey: string;
}): Promise<PartnerSignalRow | null> => {
  const baseFilter = {
    toUserId: input.currentUserId,
    status: { $in: ['sent', 'read'] },
    expiresAt: { $gt: new Date() },
    ...(input.pairId ? { pairId: { $in: pairIdVariants(input.pairId) } } : {}),
  };
  const todaySignal = await PartnerSignal.findOne({
    ...baseFilter,
    dateKey: input.dateKey,
  })
    .sort({ createdAt: -1 })
    .lean<PartnerSignalRow | null>();
  if (todaySignal) return todaySignal;
  return PartnerSignal.findOne(baseFilter)
    .sort({ createdAt: -1 })
    .lean<PartnerSignalRow | null>();
};

const shareStatus = (
  daily: PersonalDailyCheckInRow | null,
  hasPair: boolean
): 'private_draft' | 'sent' | 'disabled' => {
  if (!hasPair) return 'disabled';
  if (daily?.share.partnerSignal.status === 'sent') return 'sent';
  return 'private_draft';
};

const partnerSignalAvailable = (
  daily: PersonalDailyCheckInRow | null,
  pair: HydratedDocument<PairType> | null
): boolean => Boolean(pair && daily && daily.share.partnerSignal.status !== 'hidden');

export const personalTodayService = {
  async build(input: PersonalTodayBuildInput) {
    await connectToDatabase();

    const todayDateKey = localDateKey({
      timezoneOffsetMin: input.timezoneOffsetMin,
    });
    const dateKey = input.dateKey?.trim() || todayDateKey;
    if (!isValidDateKey(dateKey)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'dateKey must match YYYY-MM-DD',
      });
    }

    const [user, pair] = await Promise.all([
      User.findOne({ id: input.currentUserId }).lean<UserForToday | null>(),
      Pair.findOne({
        members: input.currentUserId,
        status: { $in: ['active', 'paused'] },
      }).sort({ createdAt: -1 }),
    ]);

    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const pairId = pair ? String(pair._id) : undefined;
    const factorEffectiveAt = new Date();
    await materializeCurrentOwnerFactorSnapshots({
      subjectId: input.currentUserId,
      pairId,
      factorKeys: PROFILE_FACTOR_KEYS,
      calculatedAt: factorEffectiveAt,
    });
    const [daily, weeklyCheckIn, profileSnapshots, incomingSignal] = await Promise.all([
      PersonalDailyCheckIn.findOne({
        userId: input.currentUserId,
        dateKey,
      })
        .sort({ updatedAt: -1 })
        .lean<PersonalDailyCheckInRow | null>(),
      weeklyCheckInService.current({
        currentUserId: input.currentUserId,
        pairId,
      }),
      IndividualFactorSnapshot.aggregate<ProfileFactorRow>([
        {
          $match: ownerProfileSnapshotFilter({
            ownerId: input.currentUserId,
            pairId,
          }),
        },
        { $sort: { factorKey: 1, calculatedAt: -1, revision: -1 } },
        { $group: { _id: '$factorKey', document: { $first: '$$ROOT' } } },
        { $replaceWith: '$document' },
        {
          $project: {
            _id: 0,
            subjectId: 1,
            contextPairId: 1,
            projectionPurpose: 1,
            factorKey: 1,
            status: 1,
            value: 1,
            metrics: 1,
            revision: 1,
            calculatedAt: 1,
            versions: 1,
            effectiveFrom: 1,
            effectiveUntil: 1,
          },
        },
        { $sort: { factorKey: 1 } },
        { $limit: PROFILE_FACTOR_KEYS.length },
      ]).exec(),
      findIncomingSignal({
        currentUserId: input.currentUserId,
        pairId,
        dateKey,
      }),
    ]);

    const weekly = resolveOwnerWeeklySignal(weeklyCheckIn, input.currentUserId);
    const profile = resolveProfilePersonalSignal({
      snapshots: profileSnapshots,
      ownerId: input.currentUserId,
      pairId,
      effectiveAt: factorEffectiveAt,
    });
    const freshness = resolvePersonalTodayFreshness({
      hasDaily: Boolean(daily),
      hasWeekly: Boolean(weekly),
      hasProfileData: profile.dataStatus === 'AVAILABLE',
      dateKey,
      todayDateKey,
    });
    const source: PersonalTodaySource =
      freshness === 'today' || freshness === 'stale'
        ? 'daily_checkin'
        : freshness === 'weekly_fallback'
          ? 'weekly_fallback'
          : freshness === 'profile_fallback'
            ? 'profile_fallback'
            : 'low_data';
    const { metrics, focus } = focusForSource({
      source,
      daily,
      weekly,
      profile,
    });
    const lens: RelationshipLens = daily
      ? {
          type: daily.lens.type,
          source: daily.lens.source,
          canChange: true,
        }
      : resolveRelationshipLens(user);
    const pairContext = pairContextDTO(pair);
    const overallDataStatus = personalTodayOverallDataStatus(metrics);
    const copy = buildPersonalTodayCopy({
      lens,
      focus,
      metrics,
      userName: user.username,
      pairContext,
    });
    const sender = incomingSignal
      ? await User.findOne({ id: incomingSignal.fromUserId })
          .select({ id: 1, username: 1, avatar: 1 })
          .lean<IncomingSender | null>()
      : null;
    const partnerDraft = daily?.share.partnerSignal.text?.trim() || copy.partnerSignal.text;

    return {
      user: {
        id: user.id,
        name: user.username,
        avatarUrl: toDiscordAvatarUrl(user.id, user.avatar),
        gender:
          user.personal?.gender === 'male' || user.personal?.gender === 'female'
            ? user.personal.gender
            : null,
      },
      date: {
        dateKey,
        label: formatDateLabel(dateKey),
        freshness,
      },
      lens,
      privacy: {
        mode: 'private' as const,
        label: 'Лично',
        explanation:
          'Видно только тебе. Партнёр увидит только явно отправленную фразу. Дневник и детали состояния не отправляются.',
      },
      pairContext,
      dataStatus: {
        overall: overallDataStatus,
        metricGroups: {
          resource: metrics.dataStatus.resource,
          connection: metrics.dataStatus.connection,
        },
      },
      hero: {
        mode: focus.mode,
        title: copy.hero.title,
        subtitle: copy.hero.subtitle,
        rings: {
          ...(metrics.dataStatus.resource === 'AVAILABLE'
            ? {
                resource: metrics.values.resource,
              }
            : {}),
          ...(metrics.dataStatus.connection === 'AVAILABLE'
            ? {
                closeness: metrics.values.closeness,
                tension: metrics.values.tension,
              }
            : {}),
        },
        hints: copy.hero.hints,
      },
      quickCards: copy.quickCards,
      partnerSignal: {
        available: partnerSignalAvailable(daily, pair),
        title: copy.partnerSignal.title,
        text: partnerDraft,
        visibility: shareStatus(daily, pairContext.hasPair),
        primaryCta: 'Отправить',
        secondaryCta: 'Оставить себе',
        sentAt: daily?.share.partnerSignal.sentAt?.toISOString(),
      },
      ...(incomingSignal
        ? { incomingPartnerSignal: sanitizeIncomingPartnerSignal({ signal: incomingSignal, sender }) }
        : {}),
      softOption: overallDataStatus === 'AVAILABLE' ? copy.softOption : null,
      todayMap: copy.todayMap,
      privateJournal: {
        hasEntry: Boolean(daily?.privateJournal?.text?.trim()),
        text: daily?.privateJournal?.text,
        placeholder: 'Что сегодня важно оставить только для себя?',
        maxLength: 2000,
      },
      checkIn: {
        id: daily ? String(daily._id) : undefined,
        submittedToday: freshness === 'today',
        editable: true,
      },
    };
  },
};
