import type { HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import {
  PersonalDailyCheckIn,
  type PersonalDailyAnswers,
  type PersonalDailyCheckInType,
  type PersonalDailyContext,
} from '@/models/PersonalDailyCheckIn';
import { resolveRelationshipLens } from '@/domain/services/relationshipLens.service';
import {
  buildPersonalTodayFocus,
  buildPersonalTodayMetrics,
  clamp01,
} from '@/domain/services/personalTodayRules.service';
import { buildPersonalTodayCopy } from '@/domain/services/personalTodayCopy.service';
import {
  isValidDateKey,
  localDateKey,
  personalTodayService,
} from '@/domain/services/personalToday.service';

export type PersonalDailyCheckInSubmitInput = {
  currentUserId: string;
  dateKey?: string;
  timezoneOffsetMin?: number;
  answers: PersonalDailyAnswers;
  context?: PersonalDailyContext;
  privateJournal?: {
    text?: string;
  };
  share?: {
    partnerSignal?: {
      enabled: boolean;
      text?: string;
    };
    pairMap?: {
      enabled: boolean;
    };
  };
};

const moodValues: PersonalDailyAnswers['mood'][] = [
  'calm',
  'warm',
  'tired',
  'anxious',
  'sad',
  'irritated',
  'closed',
  'open',
];

const assertMood = (value: PersonalDailyAnswers['mood']): void => {
  if (!moodValues.includes(value)) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'mood is invalid',
    });
  }
};

const normalizeAnswers = (answers: PersonalDailyAnswers): PersonalDailyAnswers => {
  assertMood(answers.mood);
  return {
    mood: answers.mood,
    energy: clamp01(answers.energy),
    stress: clamp01(answers.stress),
    closenessNeed: clamp01(answers.closenessNeed),
    spaceNeed: clamp01(answers.spaceNeed),
    supportNeed: clamp01(answers.supportNeed),
    conflictSensitivity: clamp01(answers.conflictSensitivity),
    conversationReadiness: clamp01(answers.conversationReadiness),
  };
};

const normalizeContext = (
  context: PersonalDailyContext | undefined
): PersonalDailyContext | undefined => {
  if (!context) return undefined;
  return {
    ...(context.sleep ? { sleep: context.sleep } : {}),
    ...(context.workload ? { workload: context.workload } : {}),
    ...(context.body
      ? {
          body: {
            enabled: context.body.enabled === true,
            ...(context.body.type ? { type: context.body.type } : {}),
            ...(context.body.note?.trim()
              ? { note: context.body.note.trim().slice(0, 500) }
              : {}),
            visibility: 'private',
          },
        }
      : {}),
    customTags:
      context.customTags
        ?.map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 12) ?? [],
  };
};

const activeOrPausedPair = (currentUserId: string): Promise<HydratedDocument<PairType> | null> =>
  Pair.findOne({
    members: currentUserId,
    status: { $in: ['active', 'paused'] },
  }).sort({ createdAt: -1 });

export const buildPartnerSignalDraftState = (input: {
  enabled: boolean;
  text?: string;
  fallbackText: string;
}): PersonalDailyCheckInType['share']['partnerSignal'] => {
  const text = input.text?.trim().slice(0, 300) || input.fallbackText;
  return {
    enabled: input.enabled,
    text: input.enabled ? text : undefined,
    status: input.enabled ? 'draft' : 'none',
  };
};

export const personalDailyCheckInService = {
  async submit(input: PersonalDailyCheckInSubmitInput) {
    await connectToDatabase();
    const dateKey = input.dateKey?.trim() || localDateKey({
      timezoneOffsetMin: input.timezoneOffsetMin,
    });
    if (!isValidDateKey(dateKey)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'dateKey must match YYYY-MM-DD',
      });
    }

    const [user, pair] = await Promise.all([
      User.findOne({ id: input.currentUserId }).lean<UserType | null>(),
      activeOrPausedPair(input.currentUserId),
    ]);
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const pairId = pair ? String(pair._id) : undefined;
    const lens = resolveRelationshipLens(user);
    const answers = normalizeAnswers(input.answers);
    const metrics = buildPersonalTodayMetrics({
      source: 'daily_checkin',
      answers,
    });
    const focus = buildPersonalTodayFocus({
      source: 'daily_checkin',
      metrics,
    });
    const copy = buildPersonalTodayCopy({
      lens,
      focus,
      metrics,
      userName: user.username,
      pairContext: {
        hasPair: Boolean(pair),
        label: pair ? 'Пара активна' : 'Пара пока не активна',
      },
    });
    const partnerSignal = input.share?.partnerSignal;
    const partnerSignalEnabled = partnerSignal?.enabled === true;
    const pairMapEnabled = input.share?.pairMap?.enabled === true;
    const now = new Date();
    const setPayload: Partial<PersonalDailyCheckInType> = {
      userId: input.currentUserId,
      dateKey,
      timezoneOffsetMin: input.timezoneOffsetMin,
      lens: {
        type: lens.type,
        source: lens.source,
      },
      answers,
      context: normalizeContext(input.context),
      share: {
        partnerSignal: buildPartnerSignalDraftState({
          enabled: partnerSignalEnabled,
          text: partnerSignal?.text,
          fallbackText: copy.partnerSignal.text,
        }),
        pairMap: {
          enabled: pairMapEnabled,
          visibility: pairMapEnabled ? 'aggregate_only' : 'none',
        },
      },
      computed: {
        mode: focus.mode,
        metrics: metrics.values,
        focusTitle: focus.title,
        focusSubtitle: focus.subtitle,
        ruleIds: focus.ruleIds,
        source: 'daily_checkin',
        computedVersion: 'personal-today-v1',
        generatedAt: now,
      },
    };
    if (pairId) {
      setPayload.pairId = pairId;
    }
    if (input.privateJournal) {
      setPayload.privateJournal = {
        text: input.privateJournal.text?.slice(0, 2000) ?? '',
        updatedAt: now,
      };
    }

    const updated = await PersonalDailyCheckIn.findOneAndUpdate(
      { userId: input.currentUserId, dateKey },
      {
        $set: setPayload,
        ...(pairId ? {} : { $unset: { pairId: 1 } }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<PersonalDailyCheckInType | null>();

    if (!updated) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Daily check-in was not saved',
      });
    }

    return personalTodayService.build({
      currentUserId: input.currentUserId,
      dateKey,
      timezoneOffsetMin: input.timezoneOffsetMin,
    });
  },
};
