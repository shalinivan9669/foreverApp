import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { DomainError } from '@/domain/errors';
import { User, type UserAxisVector, type UserType } from '@/models/User';
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
  buildPairWeeklyCheckInSummary,
  weeklyCheckInService,
  type PairWeeklyCheckInSummaryDTO,
  type WeeklyCheckInDTO,
} from '@/domain/services/weeklyCheckIn.service';
import {
  resolveRelationshipLens,
  type RelationshipLens,
} from '@/domain/services/relationshipLens.service';
import {
  buildPersonalTodayFocus,
  buildPersonalTodayMetrics,
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

const clamp01 = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

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

const hasVectorEvidence = (vectors: Record<string, UserAxisVector> | undefined): boolean =>
  Object.values(vectors ?? {}).some((axis) => {
    const trait = axis.trait;
    const displayed = axis.displayed;
    return (
      (trait?.evidenceCount ?? 0) > 0 ||
      (trait?.confidence ?? 0) > 0 ||
      (displayed?.confidence ?? 0) > 0
    );
  });

const profileSignal = (user: UserForToday): ProfilePersonalSignal => {
  const readiness = clamp01(user.readiness?.score);
  const fatigue = clamp01(user.fatigue?.score);
  return {
    readiness,
    fatigue,
    hasUsefulData: readiness > 0.05 || fatigue > 0.05 || hasVectorEvidence(user.vectors),
  };
};

const weeklySignalFromPairSummary = (
  summary: PairWeeklyCheckInSummaryDTO | null
): WeeklyPersonalSignal | null => {
  if (!summary?.currentUser.submitted) return null;
  return {
    readiness: summary.currentUser.readiness,
    fatigue: summary.currentUser.fatigue,
    closeness: summary.currentUser.closeness,
    irritation: summary.currentUser.irritation,
    unresolvedTopic: summary.currentUser.unresolvedTopic,
  };
};

const weeklySignalFromSolo = (checkIn: WeeklyCheckInDTO | null): WeeklyPersonalSignal | null =>
  checkIn
    ? {
        readiness: checkIn.answers.readiness,
        fatigue: checkIn.answers.fatigue,
        closeness: checkIn.answers.closeness,
        irritation: checkIn.answers.irritation,
        unresolvedTopic: checkIn.answers.unresolvedTopic,
      }
    : null;

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

  const metrics = buildPersonalTodayMetrics({ source: 'low_data' });
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
  warmth?: number;
  label: string;
} => {
  if (!pair || (pair.status !== 'active' && pair.status !== 'paused')) {
    return {
      hasPair: false,
      label: 'Пара пока не активна',
    };
  }
  const warmth = clamp01(pair.readiness?.score);
  return {
    hasPair: true,
    pairId: String(pair._id),
    status: pair.status,
    warmth,
    label:
      pair.status === 'paused'
        ? 'Пара на паузе'
        : `Тепло в паре: ${Math.round(warmth * 100)}%`,
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
  tone: input.signal.tone,
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
    const [daily, pairWeekly, soloWeekly, incomingSignal] = await Promise.all([
      PersonalDailyCheckIn.findOne({
        userId: input.currentUserId,
        dateKey,
      })
        .sort({ updatedAt: -1 })
        .lean<PersonalDailyCheckInRow | null>(),
      pair
        ? buildPairWeeklyCheckInSummary({
            pair,
            currentUserId: input.currentUserId,
          })
        : Promise.resolve(null),
      pair
        ? Promise.resolve(null)
        : weeklyCheckInService.current({ currentUserId: input.currentUserId }),
      findIncomingSignal({
        currentUserId: input.currentUserId,
        pairId,
        dateKey,
      }),
    ]);

    const weekly = pair
      ? weeklySignalFromPairSummary(pairWeekly)
      : weeklySignalFromSolo(soloWeekly);
    const profile = profileSignal(user);
    const freshness = resolvePersonalTodayFreshness({
      hasDaily: Boolean(daily),
      hasWeekly: Boolean(weekly),
      hasProfileData: profile.hasUsefulData === true,
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
      hero: {
        mode: focus.mode,
        title: copy.hero.title,
        subtitle: copy.hero.subtitle,
        rings: {
          resource: metrics.resource,
          closeness: metrics.closeness,
          tension: metrics.tension,
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
      softOption: copy.softOption,
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
