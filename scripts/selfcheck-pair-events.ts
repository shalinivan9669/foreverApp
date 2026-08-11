import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import {
  buildPairEventCandidates,
  eventCanBeAccepted,
  eventCanBeDeclined,
  eventCanBeSnoozed,
  isPairEventFactorBindingEligible,
  resolvePairEventStatus,
  type PairEventLifecycleSnapshot,
  type PairEventRuleInput,
  type PairEventWeeklyProjection,
} from '../src/domain/services/pairEvent.service';
import { MVP_FACTOR_REGISTRY } from '../src/domain/model/definitions/mvpDefinitions';
import { toPairEventDTO } from '../src/lib/dto/pairEvent.dto';
import { toPairEventCardVM } from '../src/client/viewmodels/pairEvent.viewmodels';
import type { PairEventDTO } from '../src/client/api/types';
import {
  PairEvent,
  type PairEventType,
  type PairEventTypeModel,
} from '../src/models/PairEvent';

const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

type WeeklySignal = PairEventWeeklyProjection['signals'][number];

const steadySignals = (): WeeklySignal[] => [
  {
    key: 'connection',
    status: 'STEADY',
    reasonCode: 'PAIR_LEVEL_STEADY',
    nextStepHint: 'KEEP_CURRENT_RHYTHM',
  },
  {
    key: 'tension',
    status: 'LOW',
    reasonCode: 'PAIR_LEVEL_LOW',
    nextStepHint: 'CHECK_IN_TOGETHER',
  },
  {
    key: 'recovery',
    status: 'STEADY',
    reasonCode: 'PAIR_LEVEL_STEADY',
    nextStepHint: 'KEEP_CURRENT_RHYTHM',
  },
  {
    key: 'resource',
    status: 'STEADY',
    reasonCode: 'PAIR_LEVEL_STEADY',
    nextStepHint: 'KEEP_CURRENT_RHYTHM',
  },
];

const weekly = (
  overrides: Partial<PairEventWeeklyProjection> = {}
): PairEventWeeklyProjection => ({
  cycleKey: '2026-W06',
  bothSubmitted: true,
  dataStatus: 'ENOUGH',
  signals: steadySignals(),
  ...overrides,
});

const withSignal = (
  key: WeeklySignal['key'],
  replacement: WeeklySignal
): WeeklySignal[] =>
  steadySignals().map((signal) => (signal.key === key ? replacement : signal));

const base = (overrides: Partial<PairEventRuleInput> = {}): PairEventRuleInput => ({
  pairId: '64f000000000000000000001',
  pairStatus: 'active',
  pairCreatedAt: utc(2026, 1, 5),
  weekly: weekly(),
  hasCurrentActivity: false,
  completedActivityCountLast14Days: 1,
  now: utc(2026, 2, 5),
  ...overrides,
});

const candidatesOfType = (
  input: PairEventRuleInput,
  type: PairEventType
) => buildPairEventCandidates(input).filter((event) => event.type === type);

const hasType = (input: PairEventRuleInput, type: PairEventType): boolean =>
  candidatesOfType(input, type).length > 0;

const weeklyCandidates = (input: PairEventRuleInput) =>
  buildPairEventCandidates(input).filter(
    (event) => event.source.kind === 'weekly_pair_state'
  );

const lifecycle = (
  status: PairEventLifecycleSnapshot['status'],
  overrides: Partial<PairEventLifecycleSnapshot> = {}
): PairEventLifecycleSnapshot => ({
  status,
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: true,
    maxGeneratedActivities: 2,
  },
  ...overrides,
});

const eventDto = (overrides: Partial<PairEventDTO> = {}): PairEventDTO => ({
  id: '650000000000000000000010',
  pairId: '64f000000000000000000001',
  category: 'calendar_event',
  type: 'new_year',
  title: { ru: 'Событие', en: 'Event' },
  description: { ru: 'Описание', en: 'Description' },
  why: { ru: 'Причина', en: 'Reason' },
  windowStart: utc(2026, 1, 1).toISOString(),
  windowEnd: utc(2026, 1, 10).toISOString(),
  status: 'offered',
  canAccept: true,
  canDecline: true,
  canSnooze: true,
  hasGeneratedActivity: false,
  ...overrides,
});

assert.equal(
  hasType(base({ pairCreatedAt: utc(2026, 1, 5), now: utc(2026, 2, 5) }), 'first_month'),
  true,
  'first_month candidate missing'
);
assert.equal(
  hasType(base({ pairCreatedAt: utc(2025, 12, 5), now: utc(2026, 3, 5) }), 'three_months'),
  true,
  'three_months candidate missing'
);
assert.equal(
  hasType(base({ pairCreatedAt: utc(2025, 9, 5), now: utc(2026, 3, 5) }), 'six_months'),
  true,
  'six_months candidate missing'
);
assert.equal(
  hasType(base({ pairCreatedAt: utc(2025, 6, 5), now: utc(2026, 6, 5) }), 'anniversary'),
  true,
  'anniversary candidate missing'
);
assert.equal(hasType(base({ now: utc(2026, 2, 14) }), 'valentines_day'), true);
assert.equal(hasType(base({ now: utc(2026, 3, 8) }), 'march_8'), true);
assert.equal(hasType(base({ now: utc(2026, 12, 31) }), 'new_year'), true);
assert.equal(
  hasType(base({ completedActivityCountLast14Days: 0 }), 'inactive_pair'),
  true
);
assert.equal(
  hasType(
    base({
      latestFinalActivity: {
        id: '650000000000000000000001',
        status: 'failed',
      },
    }),
    'failed_activity_recovery'
  ),
  true
);

const overloadWeekly = weekly({
  signals: withSignal('recovery', {
    key: 'recovery',
    status: 'LOW',
    reasonCode: 'PAIR_LEVEL_LOW',
    nextStepHint: 'MAKE_ROOM_FOR_RECOVERY',
  }),
});
const overloadEvents = candidatesOfType(
  base({ weekly: overloadWeekly }),
  'weekly_overload_recovery'
);
assert.equal(overloadEvents.length, 1, 'qualitative overload signal must create one recovery event');
assert.equal(overloadEvents[0].severity, 2, 'overload severity must stay coarse');
assert.equal(overloadEvents[0].source.kind, 'weekly_pair_state');

const tensionEvents = candidatesOfType(
  base({
    weekly: weekly({
      signals: withSignal('tension', {
        key: 'tension',
        status: 'HIGH',
        reasonCode: 'PAIR_LEVEL_HIGH',
        nextStepHint: 'CHOOSE_LOW_EFFORT',
      }),
    }),
  }),
  'weekly_tension_support'
);
assert.equal(tensionEvents.length, 1, 'qualitative tension signal must create one support event');
assert.equal(tensionEvents[0].severity, 3);
assert.equal(
  tensionEvents[0].targetFactorKeys.includes('communication.weekly.tension'),
  false,
  'sensitive source factor must never become an event target'
);
assert.equal(
  hasType(base({ weekly: weekly() }), 'weekly_success_celebration'),
  true,
  'steady safe signals should create a celebration event'
);

for (const unsafeProjection of [
  weekly({ dataStatus: 'PARTIAL', bothSubmitted: false, signals: overloadWeekly.signals }),
  weekly({ dataStatus: 'INSUFFICIENT', signals: overloadWeekly.signals }),
  weekly({ dataStatus: 'NOT_READY', bothSubmitted: false, signals: overloadWeekly.signals }),
  weekly({ signals: overloadWeekly.signals.slice(0, 3) }),
]) {
  assert.equal(
    weeklyCandidates(base({ weekly: unsafeProjection })).length,
    0,
    'partial, insufficient, or incomplete weekly projection must not create conclusions'
  );
}

const memberAProjection = weekly({ signals: overloadWeekly.signals });
const memberBProjection = weekly({ signals: [...overloadWeekly.signals].reverse() });
const safeProjection = (input: PairEventWeeklyProjection) =>
  weeklyCandidates(base({ weekly: input }))
    .map((event) => ({
      key: event.key,
      type: event.type,
      severity: event.severity,
      targetFactorKeys: [...event.targetFactorKeys].sort(),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
assert.deepEqual(
  safeProjection(memberAProjection),
  safeProjection(memberBProjection),
  'A/B safety equivalence: pair members must receive the same privacy-safe event projection'
);

const currentRegistryVersion = MVP_FACTOR_REGISTRY.registryVersion;
assert.equal(
  isPairEventFactorBindingEligible({
    factorRegistryVersion: currentRegistryVersion,
    targetFactorKeys: [
      'communication.weekly.connection',
      'wellbeing.current.overload',
    ],
  }),
  true
);
assert.equal(
  isPairEventFactorBindingEligible({
    factorRegistryVersion: currentRegistryVersion,
    targetFactorKeys: ['communication.weekly.tension'],
  }),
  false,
  'sensitive factor targets must fail closed'
);
assert.equal(
  isPairEventFactorBindingEligible({
    factorRegistryVersion: currentRegistryVersion,
    targetFactorKeys: ['unknown.factor'],
  }),
  false,
  'unknown factor targets must fail closed'
);
assert.equal(
  isPairEventFactorBindingEligible({
    factorRegistryVersion: currentRegistryVersion,
    targetFactorKeys: [
      'communication.weekly.connection',
      'communication.weekly.connection',
    ],
  }),
  false,
  'duplicate factor targets must fail closed'
);
assert.equal(
  isPairEventFactorBindingEligible({
    factorRegistryVersion: currentRegistryVersion + 1,
    targetFactorKeys: ['communication.weekly.connection'],
  }),
  false,
  'unknown registry versions must fail closed'
);
assert.equal(
  isPairEventFactorBindingEligible({}),
  false,
  'legacy events without semantic bindings must fail closed without throwing'
);

const generated = buildPairEventCandidates(
  base({ completedActivityCountLast14Days: 0 })
);
assert.equal(
  generated.every((event) =>
    isPairEventFactorBindingEligible({
      factorRegistryVersion: event.factorRegistryVersion,
      targetFactorKeys: event.targetFactorKeys,
    })
  ),
  true,
  'every generated event must carry a current canonical privacy-safe factor binding'
);
const gentleAction = MVP_FACTOR_REGISTRY.actions.find(
  (action) => action.key === 'action.gentleThreeMinuteCheckIn'
);
assert.ok(gentleAction, 'canonical gentle action missing');
for (const event of generated.filter(
  (candidate) =>
    candidate.category === 'calendar_event' ||
    candidate.category === 'relationship_milestone'
)) {
  assert.deepEqual(
    [...event.targetFactorKeys].sort(),
    [...gentleAction.targetFactors].sort(),
    'calendar and milestone events must map explicitly to the canonical action targets'
  );
}
assert.equal(
  new Set(generated.map((event) => event.key)).size,
  generated.length,
  'duplicate event keys generated'
);
assert.equal(buildPairEventCandidates(base({ pairStatus: 'ended' })).length, 0);
assert.equal(hasType(base({ now: utc(2026, 6, 1) }), 'partner_birthday'), false);

assert.equal(
  resolvePairEventStatus(
    {
      windowStart: utc(2026, 1, 1),
      windowEnd: utc(2026, 1, 2),
      expiresAt: utc(2026, 1, 2),
    },
    null,
    utc(2026, 1, 3)
  ),
  'expired'
);
assert.equal(
  resolvePairEventStatus(
    {
      windowStart: utc(2026, 1, 1),
      windowEnd: utc(2026, 1, 10),
      expiresAt: utc(2026, 1, 10),
    },
    { status: 'declined' },
    utc(2026, 1, 5)
  ),
  'declined'
);

assert.equal(eventCanBeAccepted(lifecycle('upcoming'), utc(2026, 1, 1)), true);
assert.equal(eventCanBeAccepted(lifecycle('offered'), utc(2026, 1, 1)), true);
assert.equal(eventCanBeAccepted(lifecycle('snoozed'), utc(2026, 1, 1)), true);
assert.equal(eventCanBeAccepted(lifecycle('accepted'), utc(2026, 1, 1)), true);
assert.equal(eventCanBeAccepted(lifecycle('expired'), utc(2026, 1, 1)), false);
assert.equal(
  eventCanBeAccepted(
    lifecycle('snoozed', { expiresAt: utc(2026, 1, 1) }),
    utc(2026, 1, 2)
  ),
  false
);
assert.equal(eventCanBeDeclined(lifecycle('accepted'), utc(2026, 1, 1)), false);
assert.equal(eventCanBeDeclined(lifecycle('completed'), utc(2026, 1, 1)), false);
assert.equal(eventCanBeSnoozed(lifecycle('upcoming'), utc(2026, 1, 1)), true);
assert.equal(eventCanBeSnoozed(lifecycle('snoozed'), utc(2026, 1, 1)), false);

const storedEvent: PairEventTypeModel & { _id: Types.ObjectId } = {
  _id: new Types.ObjectId('650000000000000000000010'),
  pairId: new Types.ObjectId('64f000000000000000000001'),
  key: 'pair:new_year:2026-01-01',
  category: 'calendar_event',
  type: 'new_year',
  title: { ru: 'Событие', en: 'Event' },
  description: { ru: 'Описание', en: 'Description' },
  why: { ru: 'Причина', en: 'Reason' },
  windowStart: utc(2026, 1, 1),
  windowEnd: utc(2026, 1, 10),
  status: 'offered',
  priority: 2,
  factorRegistryVersion: currentRegistryVersion,
  targetFactorKeys: [
    'communication.weekly.connection',
    'wellbeing.current.overload',
  ],
  source: {
    kind: 'weekly_pair_state',
    cycleKey: '2026-W01',
    refId: 'internal-source-reference',
  },
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: true,
    maxGeneratedActivities: 2,
  },
  generatedActivityIds: [],
};
assert.equal(
  new PairEvent(storedEvent).validateSync(),
  undefined,
  'semantic PairEvent model fixture must validate'
);
const duplicateTargetError = new PairEvent({
  ...storedEvent,
  _id: new Types.ObjectId('650000000000000000000012'),
  targetFactorKeys: [
    'communication.weekly.connection',
    'communication.weekly.connection',
  ],
}).validateSync();
assert.ok(
  duplicateTargetError?.errors.targetFactorKeys,
  'PairEvent model must reject duplicate target factor keys'
);
const projectedDto = toPairEventDTO(storedEvent);
assert.equal(projectedDto.hasGeneratedActivity, false);
for (const forbiddenField of [
  'source',
  'factorRegistryVersion',
  'priority',
  'severity',
  'targetFactorKeys',
  'generatedActivityIds',
  'confidence',
  'evidenceIds',
  'answers',
  'currentUser',
  'peer',
]) {
  assert.equal(
    Object.keys(projectedDto).includes(forbiddenField),
    false,
    `PairEvent DTO exposed forbidden field ${forbiddenField}`
  );
}

const acceptedVm = toPairEventCardVM(
  eventDto({
    status: 'accepted',
    hasGeneratedActivity: true,
  })
);
assert.equal(acceptedVm.canDecline, false);
assert.equal(acceptedVm.canSnooze, false);
assert.equal(acceptedVm.hasGeneratedActivity, true);

const eventServiceSource = readFileSync(
  join(process.cwd(), 'src/domain/services/pairEvent.service.ts'),
  'utf8'
);
for (const forbiddenSource of [
  'buildPairWeeklyCheckInSummary',
  'weeklyCheckIn.service',
  '.passport',
  'diagnostics_risk_focus',
  "kind: 'diagnostics'",
  'high_fatigue_recovery',
  'weekly_divergence_repair',
]) {
  assert.equal(
    eventServiceSource.includes(forbiddenSource),
    false,
    `PairEvent service still references legacy source ${forbiddenSource}`
  );
}
assert.equal(eventServiceSource.includes('weeklyCycleService.current'), true);
for (const privateSafetyDependency of [
  'safetyGate.service',
  'isOwnerSafetyGateActive',
  'isPairSafetyVetoActive',
  'isActivityEligibleForSafetyState',
  'safetyVeto',
]) {
  assert.equal(
    eventServiceSource.includes(privateSafetyDependency),
    false,
    `PairEvent service must not depend on owner-private ${privateSafetyDependency}`
  );
}
assert.equal(eventServiceSource.includes('hasEligibleActivityFactorBinding'), true);
assert.equal(eventServiceSource.includes('canonicalTemplateForEvent'), true);
assert.equal(eventServiceSource.includes('actionDefinition: canonicalTemplate.actionDefinition'), true);
assert.equal(eventServiceSource.includes('targetFactorKeys: canonicalTemplate.targetFactorKeys'), true);

console.log('pair events selfcheck passed');
