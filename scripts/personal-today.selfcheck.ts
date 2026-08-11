import { Types } from 'mongoose';
import { normalizePersonalToday } from '@/client/viewmodels/personalToday.viewmodels';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { resolveRelationshipLens } from '@/domain/services/relationshipLens.service';
import {
  buildPersonalTodayFocus,
  buildPersonalTodayMetrics,
  personalTodayOverallDataStatus,
} from '@/domain/services/personalTodayRules.service';
import { buildPersonalTodayCopy } from '@/domain/services/personalTodayCopy.service';
import {
  isValidDateKey,
  ownerProfileSnapshotFilter,
  resolveOwnerWeeklySignal,
  resolvePersonalTodayFreshness,
  resolveProfilePersonalSignal,
  sanitizeIncomingPartnerSignal,
  type ProfileFactorRow,
} from '@/domain/services/personalToday.service';
import { buildPartnerSignalDraftState } from '@/domain/services/personalDailyCheckIn.service';
import type { PartnerSignalType } from '@/models/PartnerSignal';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
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

const dailyAnswers = {
  mood: 'calm' as const,
  energy: 0.8,
  stress: 0.2,
  closenessNeed: 0.7,
  spaceNeed: 0.3,
  supportNeed: 0.4,
  conflictSensitivity: 0.2,
  conversationReadiness: 0.75,
};

const lowResourceMetrics = buildPersonalTodayMetrics({
  source: 'daily_checkin',
  answers: {
    ...dailyAnswers,
    mood: 'tired',
    energy: -1,
    stress: 0.4,
    closenessNeed: 0.95,
    supportNeed: 1.5,
    conversationReadiness: 0.2,
  },
});
const lowResourceFocus = buildPersonalTodayFocus({
  source: 'daily_checkin',
  metrics: lowResourceMetrics,
});
assert(lowResourceFocus.mode === 'low_resource', 'low resource focus expected');
assert(
  personalTodayOverallDataStatus(lowResourceMetrics) === 'AVAILABLE',
  'complete daily answers must make both metric groups available'
);
Object.values(lowResourceMetrics.values).forEach((value) => {
  assert(value >= 0 && value <= 1, 'available metrics must be clamped');
});

const weeklyMetrics = buildPersonalTodayMetrics({
  source: 'weekly_fallback',
  weekly: {
    readiness: 0.6,
    fatigue: 0.3,
    closeness: 0.4,
    irritation: 0.4,
    unresolvedTopic: true,
  },
});
const weeklyFocus = buildPersonalTodayFocus({
  source: 'weekly_fallback',
  metrics: weeklyMetrics,
  unresolvedTopic: true,
});
assert(weeklyFocus.mode === 'repair', 'owner weekly unresolved topic should select repair');

let rejectedMissingWeeklyMetric = false;
try {
  buildPersonalTodayMetrics({
    source: 'weekly_fallback',
    weekly: {
      readiness: Number.NaN,
      fatigue: 0.3,
      closeness: 0.4,
      irritation: 0.4,
    },
  });
} catch {
  rejectedMissingWeeklyMetric = true;
}
assert(rejectedMissingWeeklyMetric, 'invalid weekly metric must not become a default');

const missingMetrics = buildPersonalTodayMetrics({ source: 'low_data' });
const missingFocus = buildPersonalTodayFocus({
  source: 'low_data',
  metrics: missingMetrics,
});
const missingCopy = buildPersonalTodayCopy({
  lens: resolveRelationshipLens(userWithGender('female')),
  focus: missingFocus,
  metrics: missingMetrics,
  userName: 'Екатерина',
  pairContext: { hasPair: true, label: 'Пара активна' },
});
assert(
  missingMetrics.dataStatus.resource === 'MISSING' &&
    missingMetrics.dataStatus.connection === 'MISSING',
  'low data must expose missing metric groups'
);
assert(Object.keys(missingMetrics.values).length === 0, 'low data must not contain fake metrics');
assert(missingFocus.mode === 'low_data', 'missing metrics must not produce a conclusion');
assert(missingCopy.quickCards.length === 0, 'low data must not produce qualitative cards');
assert(missingCopy.todayMap.length === 0, 'low data must not produce numeric map values');

const metricsForSnapshot = (confidence = 0.8, freshness = 0.8) => ({
  confidence,
  freshness,
  coverage: 0.8,
  consistency: 0.9,
  evidenceCount: 2,
});

const profileSnapshot = (input: {
  factorKey: ProfileFactorRow['factorKey'];
  scalarValue: number;
  revision: number;
  calculatedAt: string;
  subjectId?: string;
  contextPairId?: string;
  projectionPurpose?: ProfileFactorRow['projectionPurpose'];
  confidence?: number;
  freshness?: number;
}): ProfileFactorRow => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === input.factorKey
  );
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.factorKey === input.factorKey
  );
  const instrument = MVP_FACTOR_REGISTRY.instruments.find((candidate) =>
    measurement ? candidate.measurementKeys.includes(measurement.key) : false
  );
  assert(Boolean(factor && measurement && instrument), 'profile provenance required');
  if (!factor || !measurement || !instrument) {
    throw new Error('profile provenance required');
  }
  const calculatedAt = new Date(input.calculatedAt);
  return {
    subjectId: input.subjectId ?? 'owner-1',
    contextPairId: input.contextPairId ?? 'pair-1',
    projectionPurpose: input.projectionPurpose ?? 'OWNER_PROFILE',
    factorKey: input.factorKey,
    revision: input.revision,
    status: 'AVAILABLE',
    value: { kind: 'SCALAR', scalarValue: input.scalarValue },
    metrics: metricsForSnapshot(input.confidence, input.freshness),
    versions: {
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      definitionVersion: factor.definitionVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
      displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
      measurementRefs: [
        { key: measurement.key, version: measurement.measurementVersion },
      ],
      instrumentRefs: [
        { key: instrument.key, version: instrument.instrumentVersion },
      ],
    },
    calculatedAt,
    effectiveFrom: new Date(calculatedAt.getTime()),
    effectiveUntil: new Date(calculatedAt.getTime() + 24 * 60 * 60 * 1000),
  };
};

const profileSnapshots: ProfileFactorRow[] = [
  profileSnapshot({
    factorKey: 'wellbeing.current.readiness',
    scalarValue: 0.2,
    revision: 1,
    calculatedAt: '2026-07-01T00:00:00.000Z',
  }),
  profileSnapshot({
    factorKey: 'wellbeing.current.readiness',
    scalarValue: 0.8,
    revision: 2,
    calculatedAt: '2026-08-01T00:00:00.000Z',
  }),
  profileSnapshot({
    factorKey: 'wellbeing.current.overload',
    scalarValue: 0.2,
    revision: 1,
    calculatedAt: '2026-08-01T00:00:00.000Z',
  }),
  profileSnapshot({
    factorKey: 'wellbeing.current.overload',
    scalarValue: 0.99,
    revision: 99,
    calculatedAt: '2026-08-10T00:00:00.000Z',
    subjectId: 'partner-2',
  }),
  profileSnapshot({
    factorKey: 'wellbeing.current.overload',
    scalarValue: 0.95,
    revision: 90,
    calculatedAt: '2026-08-09T00:00:00.000Z',
    projectionPurpose: 'PAIR_MODEL',
  }),
];
const profileSignal = resolveProfilePersonalSignal({
  snapshots: profileSnapshots,
  ownerId: 'owner-1',
  pairId: 'pair-1',
  effectiveAt: new Date('2026-08-01T12:00:00.000Z'),
});
assert(profileSignal.dataStatus === 'AVAILABLE', 'owner profile snapshots should be available');
assert(
  profileSignal.dataStatus === 'AVAILABLE' && profileSignal.readiness === 0.8,
  'latest owner snapshot must win'
);
assert(
  profileSignal.dataStatus === 'AVAILABLE' && profileSignal.fatigue === 0.2,
  'partner and pair-model snapshots must not affect owner profile fallback'
);

const profileMetrics = buildPersonalTodayMetrics({
  source: 'profile_fallback',
  profile: profileSignal,
});
const profileFocus = buildPersonalTodayFocus({
  source: 'profile_fallback',
  metrics: profileMetrics,
});
const profileCopy = buildPersonalTodayCopy({
  lens: resolveRelationshipLens(userWithGender('male')),
  focus: profileFocus,
  metrics: profileMetrics,
  userName: 'Иван',
  pairContext: { hasPair: true, label: 'Пара активна' },
});
assert(profileMetrics.dataStatus.resource === 'AVAILABLE', 'profile resource expected');
assert(profileMetrics.dataStatus.connection === 'MISSING', 'profile connection missing');
assert(
  personalTodayOverallDataStatus(profileMetrics) === 'INSUFFICIENT',
  'partial profile groups must remain insufficient'
);
assert(profileFocus.mode === 'low_data', 'partial groups must not produce a focus conclusion');
assert(profileCopy.quickCards.length === 0, 'partial groups must not produce qualitative cards');
assert(profileCopy.todayMap.length === 0, 'partial groups must not produce numeric map');

const insufficientProfileSignal = resolveProfilePersonalSignal({
  snapshots: profileSnapshots.filter(
    (snapshot) => snapshot.factorKey === 'wellbeing.current.readiness'
  ),
  ownerId: 'owner-1',
  pairId: 'pair-1',
  effectiveAt: new Date('2026-08-01T12:00:00.000Z'),
});
assert(
  insufficientProfileSignal.dataStatus === 'INSUFFICIENT',
  'one profile factor must be insufficient, not neutral'
);
const lowConfidenceSignal = resolveProfilePersonalSignal({
  snapshots: [
    profileSnapshot({
      factorKey: 'wellbeing.current.readiness',
      scalarValue: 0.8,
      revision: 1,
      calculatedAt: '2026-08-01T00:00:00.000Z',
      confidence: 0.1,
    }),
    profileSnapshot({
      factorKey: 'wellbeing.current.overload',
      scalarValue: 0.2,
      revision: 1,
      calculatedAt: '2026-08-01T00:00:00.000Z',
    }),
  ],
  ownerId: 'owner-1',
  pairId: 'pair-1',
  effectiveAt: new Date('2026-08-01T12:00:00.000Z'),
});
assert(lowConfidenceSignal.dataStatus === 'INSUFFICIENT', 'low confidence is insufficient');

const pairFilter = ownerProfileSnapshotFilter({ ownerId: 'owner-1', pairId: 'pair-1' });
const soloFilter = ownerProfileSnapshotFilter({ ownerId: 'owner-1' });
assert(pairFilter.subjectId === 'owner-1', 'snapshot filter must use session owner');
assert(pairFilter.projectionPurpose === 'OWNER_PROFILE', 'owner projection required');
assert(pairFilter.contextPairId === 'pair-1', 'current pair context required');
assert(
  typeof soloFilter.contextPairId === 'object' &&
    soloFilter.contextPairId.$exists === false,
  'solo profile must use unscoped snapshots'
);

const weeklyAnswers = {
  readiness: 0.7,
  fatigue: 0.2,
  closeness: 0.8,
  irritation: 0.1,
  unresolvedTopic: false,
};
assert(
  resolveOwnerWeeklySignal({ userId: 'owner-1', answers: weeklyAnswers }, 'owner-1')
    ?.readiness === 0.7,
  'owner weekly answers should be accepted'
);
assert(
  resolveOwnerWeeklySignal({ userId: 'partner-2', answers: weeklyAnswers }, 'owner-1') ===
    null,
  'partner weekly answers must not be used'
);
assert(
  resolveOwnerWeeklySignal(
    {
      userId: 'owner-1',
      answers: { ...weeklyAnswers, readiness: Number.NaN },
    },
    'owner-1'
  ) === null,
  'invalid owner weekly data must remain unavailable'
);

const normalizedLowData = normalizePersonalToday({
  dataStatus: {
    overall: 'MISSING',
    metricGroups: { resource: 'MISSING', connection: 'MISSING' },
  },
  hero: {
    mode: 'stable',
    title: 'Недостоверный качественный вывод',
    subtitle: 'Не должен отображаться',
    rings: { resource: 0.5, closeness: 0.5, tension: 0.5 },
    hints: ['Недостоверная подсказка'],
  },
  quickCards: [
    { key: 'state', title: 'Недостоверно', body: 'Недостоверно', icon: 'heart' },
  ],
  softOption: {
    title: 'Недостоверно',
    intro: 'Недостоверно',
    phrase: 'Недостоверно',
    alternatives: [],
    primaryCta: 'Недостоверно',
    secondaryCta: 'Недостоверно',
  },
  todayMap: [{ key: 'resource', label: 'Ресурс', value: 0.5 }],
});
assert(normalizedLowData !== null, 'low-data DTO is a valid empty state');
assert(
  normalizedLowData?.hero.rings.resource === undefined,
  'viewmodel must remove numeric conclusions from low data'
);
assert(normalizedLowData?.quickCards.length === 0, 'viewmodel must remove low-data cards');
assert(normalizedLowData?.softOption === null, 'viewmodel must remove low-data suggestion');
assert(normalizedLowData?.todayMap.length === 0, 'viewmodel must remove low-data map');
assert(
  !normalizedLowData?.hero.title.includes('Недостоверный'),
  'viewmodel must replace low-data qualitative conclusions'
);

assert(
  resolvePersonalTodayFreshness({
    hasDaily: false,
    hasWeekly: true,
    hasProfileData: false,
    dateKey: '2026-07-02',
    todayDateKey: '2026-07-02',
  }) === 'weekly_fallback',
  'weekly freshness fallback expected'
);
assert(
  resolvePersonalTodayFreshness({
    hasDaily: false,
    hasWeekly: false,
    hasProfileData: false,
    dateKey: '2026-07-02',
    todayDateKey: '2026-07-02',
  }) === 'low_data',
  'low-data freshness expected'
);

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
  expiresAt: new Date('2026-08-01T10:00:00.000Z'),
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:00:00.000Z'),
} satisfies PartnerSignalType & { _id: Types.ObjectId };
const incomingDTO = sanitizeIncomingPartnerSignal({
  signal,
  sender: { id: 'sender', username: 'Партнёр', avatar: '0' },
});
const incomingSerialized = JSON.stringify(incomingDTO);
assert(!incomingSerialized.includes('privateJournal'), 'incoming signal has no journal');
assert(!incomingSerialized.includes('answers'), 'incoming signal has no raw answers');

const draft = buildPartnerSignalDraftState({
  enabled: true,
  text: 'Мягкая фраза',
  fallbackText: 'Запасная фраза',
});
assert(draft.status === 'draft', 'daily submit creates a draft only');
assert(draft.status !== 'sent', 'explicit partner-signal POST is required');
assert(isValidDateKey('2026-07-02'), 'valid dateKey accepted');
assert(!isValidDateKey('2026-7-2'), 'invalid dateKey rejected');

console.log('personal-today selfcheck passed');
