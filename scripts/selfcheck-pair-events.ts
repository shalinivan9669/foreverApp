import {
  buildPairEventCandidates,
  resolvePairEventStatus,
  type PairEventRuleInput,
} from '../src/domain/services/pairEvent.service';
import type { PairWeeklyCheckInSummaryDTO } from '../src/domain/services/weeklyCheckIn.service';

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

const duplicated = buildPairEventCandidates(base({ completedActivityCountLast14Days: 0 }));
assert(new Set(duplicated.map((event) => event.key)).size === duplicated.length, 'duplicate event keys generated');
assert(buildPairEventCandidates(base({ pairStatus: 'ended' })).length === 0, 'ended pair should not generate new active events');

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

console.log('pair events selfcheck passed');
