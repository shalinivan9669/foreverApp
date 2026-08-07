import {
  buildPairEventCandidates,
  eventCanBeAccepted,
  eventCanBeDeclined,
  eventCanBeSnoozed,
  resolvePairEventStatus,
  type PairEventLifecycleSnapshot,
  type PairEventRuleInput,
} from '../src/domain/services/pairEvent.service';
import { toPairEventCardVM } from '../src/client/viewmodels/pairEvent.viewmodels';
import type { PairEventDTO } from '../src/client/api/types';
import type { PairWeeklyCheckInSummaryDTO } from '../src/domain/services/weeklyCheckIn.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const utc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

const weekly = (input: {
  weekKey?: string;
  fatigue?: number;
  readiness?: number;
  bothSubmitted?: boolean;
  hasDivergence?: boolean;
}): PairWeeklyCheckInSummaryDTO => ({
  pairId: '64f000000000000000000001',
  weekKey: input.weekKey ?? '2026-W23',
  currentUser: { userId: 'u1', submitted: true },
  peer: { userId: 'u2', submitted: input.bothSubmitted ?? true },
  pair: {
    submittedCount: input.bothSubmitted === false ? 1 : 2,
    bothSubmitted: input.bothSubmitted ?? true,
    readiness: input.readiness,
    fatigue: input.fatigue,
    unresolvedTopicCount: 0,
    hasDivergence: input.hasDivergence ?? false,
    divergence: input.hasDivergence ? { readiness: 0.6 } : undefined,
    status: input.hasDivergence ? 'divergent' : 'complete',
  },
});

const base = (overrides: Partial<PairEventRuleInput>): PairEventRuleInput => ({
  pairId: '64f000000000000000000001',
  pairStatus: 'active',
  pairCreatedAt: utc(2026, 1, 5),
  weekly: weekly({ fatigue: 0.4, readiness: 0.6 }),
  hasCurrentActivity: false,
  completedActivityCountLast14Days: 1,
  now: utc(2026, 2, 5),
  ...overrides,
});

const hasType = (input: PairEventRuleInput, type: string): boolean =>
  buildPairEventCandidates(input).some((event) => event.type === type);

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

const eventDto = (overrides: Partial<PairEventDTO>): PairEventDTO => ({
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
  priority: 2,
  canAccept: true,
  canDecline: true,
  canSnooze: true,
  generatedActivityIds: [],
  ...overrides,
});

assert(hasType(base({ pairCreatedAt: utc(2026, 1, 5), now: utc(2026, 2, 5) }), 'first_month'), 'first_month candidate missing');
assert(hasType(base({ pairCreatedAt: utc(2025, 12, 5), now: utc(2026, 3, 5) }), 'three_months'), 'three_months candidate missing');
assert(hasType(base({ pairCreatedAt: utc(2025, 9, 5), now: utc(2026, 3, 5) }), 'six_months'), 'six_months candidate missing');
assert(hasType(base({ pairCreatedAt: utc(2025, 6, 5), now: utc(2026, 6, 5) }), 'anniversary'), 'anniversary candidate missing');
assert(hasType(base({ now: utc(2026, 2, 14) }), 'valentines_day'), 'valentines_day candidate missing');
assert(hasType(base({ now: utc(2026, 3, 8) }), 'march_8'), 'march_8 candidate missing');
assert(hasType(base({ now: utc(2026, 12, 31) }), 'new_year'), 'new_year candidate missing');
assert(hasType(base({ completedActivityCountLast14Days: 0 }), 'inactive_pair'), 'inactive_pair candidate missing');
assert(
  hasType(
    base({
      latestFinalActivity: { id: '650000000000000000000001', status: 'failed' },
    }),
    'failed_activity_recovery'
  ),
  'failed_activity_recovery candidate missing'
);
assert(hasType(base({ weekly: weekly({ fatigue: 0.86, readiness: 0.5 }) }), 'high_fatigue_recovery'), 'high fatigue candidate missing');
assert(hasType(base({ weekly: weekly({ fatigue: 0.4, readiness: 0.5, hasDivergence: true }) }), 'weekly_divergence_repair'), 'weekly divergence candidate missing');
assert(hasType(base({ weekly: weekly({ fatigue: 0.2, readiness: 0.8 }) }), 'weekly_success_celebration'), 'weekly success candidate missing');
assert(
  hasType(
    base({
      diagnostics: {
        riskZones: [{ axis: 'communication', severity: 3 }],
        lastDiagnosticsAt: utc(2026, 2, 1),
      },
    }),
    'diagnostics_risk_focus'
  ),
  'diagnostics risk candidate missing'
);
assert(
  !hasType(
    base({
      diagnostics: {
        riskZones: [{ axis: 'finance', severity: 3 }],
        lastDiagnosticsAt: utc(2026, 2, 1),
      },
    }),
    'diagnostics_risk_focus'
  ),
  'P0-sensitive diagnostics must not generate a pair event'
);

const duplicated = buildPairEventCandidates(base({ completedActivityCountLast14Days: 0 }));
assert(new Set(duplicated.map((event) => event.key)).size === duplicated.length, 'duplicate event keys generated');
assert(buildPairEventCandidates(base({ pairStatus: 'ended' })).length === 0, 'ended pair should not generate new active events');
assert(!hasType(base({ now: utc(2026, 6, 1) }), 'partner_birthday'), 'partner_birthday should stay reserved without birthday data');

const expired = resolvePairEventStatus(
  {
    windowStart: utc(2026, 1, 1),
    windowEnd: utc(2026, 1, 2),
    expiresAt: utc(2026, 1, 2),
  },
  null,
  utc(2026, 1, 3)
);
assert(expired === 'expired', 'expired event should resolve to expired');

const declined = resolvePairEventStatus(
  {
    windowStart: utc(2026, 1, 1),
    windowEnd: utc(2026, 1, 10),
    expiresAt: utc(2026, 1, 10),
  },
  { status: 'declined' },
  utc(2026, 1, 5)
);
assert(declined === 'declined', 'declined event should stay declined');

assert(eventCanBeAccepted(lifecycle('upcoming'), utc(2026, 1, 1)), 'upcoming should be acceptable');
assert(eventCanBeAccepted(lifecycle('offered'), utc(2026, 1, 1)), 'offered should be acceptable');
assert(eventCanBeAccepted(lifecycle('snoozed'), utc(2026, 1, 1)), 'snoozed should be acceptable before expiry');
assert(eventCanBeAccepted(lifecycle('accepted'), utc(2026, 1, 1)), 'accepted should support idempotent accept');
assert(!eventCanBeAccepted(lifecycle('expired'), utc(2026, 1, 1)), 'expired should not be acceptable');
assert(
  !eventCanBeAccepted(lifecycle('snoozed', { expiresAt: utc(2026, 1, 1) }), utc(2026, 1, 2)),
  'expired snoozed event should not be acceptable'
);
assert(!eventCanBeDeclined(lifecycle('accepted'), utc(2026, 1, 1)), 'accepted should not be declinable');
assert(!eventCanBeDeclined(lifecycle('completed'), utc(2026, 1, 1)), 'completed should not be declinable');
assert(!eventCanBeDeclined(lifecycle('expired'), utc(2026, 1, 1)), 'expired should not be declinable');
assert(!eventCanBeDeclined(lifecycle('declined'), utc(2026, 1, 1)), 'declined should not be declinable');
assert(eventCanBeSnoozed(lifecycle('upcoming'), utc(2026, 1, 1)), 'upcoming should be snoozable');
assert(eventCanBeSnoozed(lifecycle('offered'), utc(2026, 1, 1)), 'offered should be snoozable');
assert(!eventCanBeSnoozed(lifecycle('accepted'), utc(2026, 1, 1)), 'accepted should not be snoozable');
assert(!eventCanBeSnoozed(lifecycle('snoozed'), utc(2026, 1, 1)), 'active snooze should not be snoozable again');

const acceptedVm = toPairEventCardVM(eventDto({
  status: 'accepted',
  generatedActivityIds: ['650000000000000000000011'],
}));
assert(!acceptedVm.canDecline, 'accepted VM should not show decline');
assert(!acceptedVm.canSnooze, 'accepted VM should not show snooze');
assert(acceptedVm.hasGeneratedActivities, 'accepted VM should expose generated activities');

const eventServiceSource = readFileSync(
  join(process.cwd(), 'src/domain/services/pairEvent.service.ts'),
  'utf8'
);
assert(
  eventServiceSource.includes('eventEligibleForPairProjection'),
  'pair event DTO projection must enforce event eligibility'
);
assert(
  eventServiceSource.includes('system-resource-relief'),
  'safety mode must use the canonical neutral activity fallback'
);
assert(
  eventServiceSource.includes('hasP0SensitiveActivityAxis'),
  'generated event activities must reject P0-sensitive axes'
);
assert(
  eventServiceSource.includes('isActivityEligibleForSafetyState'),
  'generated event activities must enforce the safety gate before DTO mapping'
);
assert(
  eventServiceSource.includes('createOffers: false'),
  'P0 event accept must not create non-canonical activity offers'
);
assert(
  eventServiceSource.includes("'stateMeta.sourceMeta.eventId': String(input.event._id)"),
  'P0 event accept must retire previously generated offered activities'
);

console.log('pair events selfcheck passed');
