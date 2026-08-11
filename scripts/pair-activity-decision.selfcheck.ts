import assert from 'node:assert/strict';
import { MVP_FACTOR_REGISTRY } from '../src/domain/model/definitions/mvpDefinitions';
import type { RecommendationFactorSnapshot } from '../src/domain/model/recommendations/recommendation';
import { hasEligibleActivityFactorBinding } from '../src/domain/services/activityEligibility.service';
import {
  buildPairActivitySuggestionPlan,
  SYSTEM_ACTIVITY_TEMPLATES,
  type BuildPairActivitySuggestionPlanInput,
  type PairActivityPrimaryReason,
} from '../src/domain/services/pairActivityDecision.service';

const snapshot = (
  factorKey: string,
  value: number,
  revision = 1
): RecommendationFactorSnapshot => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === factorKey
  );
  assert.ok(factor, `missing test factor ${factorKey}`);
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.factorKey === factorKey
  );
  const instrument = MVP_FACTOR_REGISTRY.instruments.find((candidate) =>
    measurement ? candidate.measurementKeys.includes(measurement.key) : false
  );
  assert.ok(measurement && instrument, `missing test provenance ${factorKey}`);
  return {
    snapshotId: `pair-1:${factorKey}:${revision}`,
    pairId: 'pair-1',
    factorKey,
    revision,
    status: 'AVAILABLE',
    value: { kind: 'SCALAR', value },
    metrics: {
      confidence: 0.8,
      coverage: 1,
      freshness: 1,
      consistency: 1,
      evidenceCount: 2,
    },
    evidenceIds: [`event:${factorKey}`],
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
    inputHash: 'a'.repeat(64),
    outputHash: 'b'.repeat(64),
    calculatedAt: new Date('2026-08-11T00:00:00.000Z'),
    effectiveFrom: new Date('2026-08-11T00:00:00.000Z'),
    effectiveUntil: new Date('2026-08-12T00:00:00.000Z'),
  };
};

const recommendationSnapshots: RecommendationFactorSnapshot[] = [
  snapshot('communication.weekly.connection', 0.45),
  snapshot('wellbeing.current.overload', 0.3),
  snapshot('communication.weekly.tension', 0.2),
];

const base = (
  overrides: Partial<BuildPairActivitySuggestionPlanInput> = {}
): BuildPairActivitySuggestionPlanInput => ({
  pairId: 'pair-1',
  pairStatus: 'active',
  hasCurrentActivity: false,
  factorSnapshots: recommendationSnapshots,
  pairEvaluations: [],
  blockedActionKeys: [],
  safetyVeto: false,
  ...overrides,
});

const expectReason = (
  expected: PairActivityPrimaryReason,
  input: BuildPairActivitySuggestionPlanInput
): void => {
  const plan = buildPairActivitySuggestionPlan(input);
  assert.equal(plan.primaryReason, expected);
  assert.equal(plan.sourceMeta.registryVersion, MVP_FACTOR_REGISTRY.registryVersion);
  assert.equal(plan.sourceMeta.decisionVersion, 'activity-decision-v2');
};

expectReason('current_activity', base({ hasCurrentActivity: true }));
expectReason('pair_paused', base({ pairStatus: 'paused' }));
expectReason('pair_ended', base({ pairStatus: 'ended' }));
expectReason('neutral_fallback', base({ factorSnapshots: [] }));
expectReason('neutral_fallback', base({ factorSnapshots: [], safetyVeto: true }));
expectReason('neutral_fallback', base({ factorSnapshots: [], safetyVeto: false }));
expectReason(
  'neutral_fallback',
  base({ blockedActionKeys: ['action.gentleThreeMinuteCheckIn'] })
);

const ready = buildPairActivitySuggestionPlan(base());
assert.equal(ready.status, 'ready');
assert.equal(ready.primaryReason, 'factor_signal');
assert.equal(ready.recommendedActionKeys[0], 'action.gentleThreeMinuteCheckIn');
assert.equal(ready.targetFactorKey, 'communication.weekly.connection');

const gatedFallback = buildPairActivitySuggestionPlan(
  base({ factorSnapshots: [], safetyVeto: true })
);
const genericFallback = buildPairActivitySuggestionPlan(
  base({ factorSnapshots: [], safetyVeto: false })
);
assert.equal(gatedFallback.primaryReason, genericFallback.primaryReason);
assert.equal(gatedFallback.sourceMeta.trigger, 'neutral_fallback');
assert.equal(genericFallback.sourceMeta.trigger, 'neutral_fallback');
assert.doesNotMatch(
  JSON.stringify([gatedFallback, genericFallback]),
  /safety_gate|safety_fallback/,
  'participant-visible fallback labels must remain neutral'
);

assert.equal(SYSTEM_ACTIVITY_TEMPLATES.length, 5);
assert.ok(
  SYSTEM_ACTIVITY_TEMPLATES.every(
    (item) =>
      item.actionDefinition.registryVersion === MVP_FACTOR_REGISTRY.registryVersion &&
      item.targetFactorKeys.length > 0 &&
      hasEligibleActivityFactorBinding(item)
  )
);
assert.ok(
  SYSTEM_ACTIVITY_TEMPLATES.every(
    (item) =>
      !Object.prototype.hasOwnProperty.call(item, 'axis') &&
      !Object.prototype.hasOwnProperty.call(item, 'effect')
  )
);

console.log('pair-activity-decision selfcheck: Factor Engine scenarios passed');
