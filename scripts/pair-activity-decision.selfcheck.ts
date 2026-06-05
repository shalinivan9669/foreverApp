import assert from 'node:assert/strict';
import {
  buildPairActivitySuggestionPlan,
  SYSTEM_ACTIVITY_TEMPLATES,
  type BuildPairActivitySuggestionPlanInput,
  type PairActivityPrimaryReason,
} from '../src/domain/services/pairActivityDecision.service';

const weekly = (
  overrides: Partial<BuildPairActivitySuggestionPlanInput['weekly']['pair']> = {},
  currentSubmitted = true
): BuildPairActivitySuggestionPlanInput['weekly'] => ({
  pairId: 'pair-1',
  weekKey: '2026-W23',
  currentUser: { userId: 'user-a', submitted: currentSubmitted },
  peer: { userId: 'user-b', submitted: true },
  pair: {
    submittedCount: currentSubmitted ? 2 : 1,
    bothSubmitted: currentSubmitted,
    readiness: 0.65,
    fatigue: 0.35,
    closeness: 0.65,
    irritation: 0.2,
    unresolvedTopicCount: 0,
    hasDivergence: false,
    status: currentSubmitted ? 'complete' : 'partial',
    ...overrides,
  },
});

const diagnostics: BuildPairActivitySuggestionPlanInput['diagnostics'] = {
  overall: { confidence: 0.8, status: 'neutral' },
  riskZones: [],
  lastDiagnosticsAt: '2026-06-01T00:00:00.000Z',
};

const base = (
  overrides: Partial<BuildPairActivitySuggestionPlanInput> = {}
): BuildPairActivitySuggestionPlanInput => ({
  pairId: 'pair-1',
  pairStatus: 'active',
  fatigue: 0.35,
  readiness: 0.65,
  diagnostics,
  weekly: weekly(),
  hasCurrentActivity: false,
  ...overrides,
});

const expectReason = (
  expected: PairActivityPrimaryReason,
  input: BuildPairActivitySuggestionPlanInput
): void => {
  const plan = buildPairActivitySuggestionPlan(input);
  assert.equal(plan.primaryReason, expected);
};

expectReason('current_activity', base({ hasCurrentActivity: true }));
expectReason('insufficient_diagnostics', base({ diagnostics: undefined }));
expectReason(
  'missing_weekly_checkin',
  base({ weekly: weekly({}, false) })
);
expectReason(
  'high_fatigue',
  base({ fatigue: 0.82, weekly: weekly({ fatigue: 0.82 }) })
);
expectReason(
  'weekly_divergence',
  base({
    weekly: weekly({
      hasDivergence: true,
      status: 'divergent',
      divergence: { readiness: 0.5, fatigue: 0.1, closeness: 0.2, irritation: 0.15 },
    }),
  })
);
expectReason(
  'risk_zone',
  base({
    diagnostics: {
      ...diagnostics,
      overall: { confidence: 0.8, status: 'risk' },
      riskZones: [{ axis: 'communication', severity: 3 }],
    },
  })
);
expectReason('maintenance', base());

assert.equal(SYSTEM_ACTIVITY_TEMPLATES.length, 24);
assert.ok(
  SYSTEM_ACTIVITY_TEMPLATES.filter((item) => item.axis.includes('sexuality'))
    .every((item) => item.requiresConsent === true)
);

console.log('pair-activity-decision selfcheck: 7 scenarios and 24 templates passed');
