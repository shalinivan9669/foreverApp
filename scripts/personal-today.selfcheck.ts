import { Types } from 'mongoose';
import { resolveRelationshipLens } from '@/domain/services/relationshipLens.service';
import {
  buildPersonalTodayFocus,
  buildPersonalTodayMetrics,
} from '@/domain/services/personalTodayRules.service';
import { buildPersonalTodayCopy } from '@/domain/services/personalTodayCopy.service';
import {
  isValidDateKey,
  resolvePersonalTodayFreshness,
  sanitizeIncomingPartnerSignal,
} from '@/domain/services/personalToday.service';
import { buildPartnerSignalDraftState } from '@/domain/services/personalDailyCheckIn.service';
import type { PartnerSignalType } from '@/models/PartnerSignal';

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

type LensUser = Parameters<typeof resolveRelationshipLens>[0];

const userWithGender = (
  gender: 'male' | 'female',
  defaultLens?: 'feminine' | 'masculine' | 'balanced' | 'custom'
): LensUser => ({
  personal: {
    gender,
    age: 30,
    city: 'Алматы',
    relationshipStatus: 'in_relationship',
  },
  profile: defaultLens
    ? {
        relationshipLens: {
          defaultLens,
          source: 'user_setting',
        },
      }
    : {},
});

const copyText = (copy: ReturnType<typeof buildPersonalTodayCopy>): string =>
  JSON.stringify(copy).toLowerCase();

const lowResourceMetrics = buildPersonalTodayMetrics({
  source: 'daily_checkin',
  answers: {
    mood: 'tired',
    energy: -1,
    stress: 0.4,
    closenessNeed: 0.95,
    spaceNeed: 0.2,
    supportNeed: 1.5,
    conflictSensitivity: 0.2,
    conversationReadiness: 0.2,
  },
});
const lowResourceFocus = buildPersonalTodayFocus({
  source: 'daily_checkin',
  metrics: lowResourceMetrics,
});

const conflictMetrics = buildPersonalTodayMetrics({
  source: 'daily_checkin',
  answers: {
    mood: 'irritated',
    energy: 0.9,
    stress: 0.82,
    closenessNeed: 0.3,
    spaceNeed: 0.8,
    supportNeed: 0.4,
    conflictSensitivity: 0.9,
    conversationReadiness: 0.8,
  },
});
const conflictFocus = buildPersonalTodayFocus({
  source: 'daily_checkin',
  metrics: conflictMetrics,
});

const repairMetrics = buildPersonalTodayMetrics({
  source: 'weekly_fallback',
  weekly: {
    readiness: 0.6,
    fatigue: 0.3,
    closeness: 0.4,
    irritation: 0.4,
    unresolvedTopic: true,
  },
});
const repairFocus = buildPersonalTodayFocus({
  source: 'weekly_fallback',
  metrics: repairMetrics,
  unresolvedTopic: true,
});

const feminineLens = resolveRelationshipLens(userWithGender('female'));
const masculineLens = resolveRelationshipLens(userWithGender('male'));
const savedLens = resolveRelationshipLens(userWithGender('female', 'masculine'));

assert(feminineLens.type === 'feminine' && feminineLens.source === 'gender_default', 'female default lens');
assert(masculineLens.type === 'masculine' && masculineLens.source === 'gender_default', 'male default lens');
assert(savedLens.type === 'masculine' && savedLens.source === 'user_setting', 'saved lens override');

assert(
  resolvePersonalTodayFreshness({
    hasDaily: false,
    hasWeekly: true,
    hasProfileData: false,
    dateKey: '2026-07-02',
    todayDateKey: '2026-07-02',
  }) === 'weekly_fallback',
  'weekly freshness fallback'
);
assert(
  resolvePersonalTodayFreshness({
    hasDaily: false,
    hasWeekly: false,
    hasProfileData: false,
    dateKey: '2026-07-02',
    todayDateKey: '2026-07-02',
  }) === 'low_data',
  'low data freshness fallback'
);

assert(lowResourceFocus.mode === 'low_resource', 'low resource wins before closeness');
assert(conflictFocus.mode === 'conflict_risk', 'high tension focus');
assert(repairFocus.mode === 'repair', 'unresolved topic repair focus');
Object.values(lowResourceMetrics).forEach((value) => {
  assert(value >= 0 && value <= 1, 'metrics are clamped');
});

const feminineCopy = buildPersonalTodayCopy({
  lens: feminineLens,
  focus: lowResourceFocus,
  metrics: lowResourceMetrics,
  userName: 'Екатерина',
  pairContext: { hasPair: true, label: 'Тепло в паре: 72%' },
});
const masculineCopy = buildPersonalTodayCopy({
  lens: masculineLens,
  focus: conflictFocus,
  metrics: conflictMetrics,
  userName: 'Иван',
  pairContext: { hasPair: true, label: 'Тепло в паре: 72%' },
});

const feminineTitles = feminineCopy.quickCards.map((card) => card.title);
const masculineTitles = masculineCopy.quickCards.map((card) => card.title);
assert(feminineTitles.includes('Моё состояние'), 'feminine state card');
assert(feminineTitles.includes('Что мне важно'), 'feminine need card');
assert(feminineTitles.includes('Что влияет'), 'feminine influence card');
assert(masculineTitles.includes('Мой ресурс'), 'masculine resource card');
assert(masculineTitles.includes('Мой вклад'), 'masculine contribution card');
assert(masculineTitles.includes('Риск дня'), 'masculine risk card');

const forbiddenWords = ['должен', 'обязан', 'диагноз'];
const allCopy = `${copyText(feminineCopy)} ${copyText(masculineCopy)}`;
for (const word of forbiddenWords) {
  assert(!allCopy.includes(word), `copy contains forbidden word: ${word}`);
}

const signal = {
  _id: new Types.ObjectId(),
  pairId: new Types.ObjectId(),
  fromUserId: 'sender',
  toUserId: 'receiver',
  sourceCheckInId: new Types.ObjectId(),
  dateKey: '2026-07-02',
  text: 'Я рядом. Давай спокойно сверимся вечером.',
  tone: 'support',
  status: 'sent',
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:00:00.000Z'),
} satisfies PartnerSignalType & { _id: Types.ObjectId };
const incomingDTO = sanitizeIncomingPartnerSignal({
  signal,
  sender: {
    id: 'sender',
    username: 'Партнёр',
    avatar: '0',
  },
});
const incomingSerialized = JSON.stringify(incomingDTO);
assert(!incomingSerialized.includes('privateJournal'), 'incoming signal has no privateJournal');
assert(!incomingSerialized.includes('body'), 'incoming signal has no body context');
assert(!incomingSerialized.includes('answers'), 'incoming signal has no raw answers');

const draft = buildPartnerSignalDraftState({
  enabled: true,
  text: 'Мягкая фраза',
  fallbackText: 'Запасная фраза',
});
assert(draft.status === 'draft', 'daily submit creates draft only');
assert(draft.status !== 'sent', 'explicit partner-signal POST required to send');
assert(isValidDateKey('2026-07-02'), 'valid dateKey accepted');
assert(!isValidDateKey('2026-7-2'), 'invalid dateKey rejected');

console.log('personal-today selfcheck passed');
