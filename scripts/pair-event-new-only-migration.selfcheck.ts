import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import { MVP_FACTOR_REGISTRY } from '../src/domain/model/definitions/mvpDefinitions';
import {
  PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS,
  PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
  planPairEventNewOnlyMigration,
  type RawPairEventForMigration,
} from './lib/pair-event-new-only-migration';

const now = new Date('2026-08-11T10:00:00.000Z');

const baseRow = (
  overrides: Partial<RawPairEventForMigration> = {}
): RawPairEventForMigration => ({
  _id: new Types.ObjectId(),
  pairId: new Types.ObjectId(),
  key: 'pair:first_month:2026-08-11',
  category: 'relationship_milestone',
  type: 'first_month',
  title: { ru: 'Первый месяц', en: 'First month' },
  description: { ru: 'Нейтральное событие', en: 'Neutral event' },
  why: { ru: 'Нейтральная история', en: 'Neutral history' },
  windowStart: new Date('2026-08-10T00:00:00.000Z'),
  windowEnd: new Date('2026-08-20T00:00:00.000Z'),
  status: 'offered',
  priority: 2,
  axis: ['communication'],
  source: {
    kind: 'pair_created_at',
    date: new Date('2026-07-11T00:00:00.000Z'),
  },
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: true,
    maxGeneratedActivities: 2,
  },
  generatedActivityIds: [],
  ...overrides,
});

const serializedUpdate = (row: RawPairEventForMigration): string => {
  const plan = planPairEventNewOnlyMigration(row, now);
  assert.ok(plan.update, `${plan.disposition} must produce an update`);
  return JSON.stringify(plan.update);
};

const gentleAction = MVP_FACTOR_REGISTRY.actions.find(
  (action) => action.key === 'action.gentleThreeMinuteCheckIn'
);
assert.ok(gentleAction, 'canonical gentle action is required');
assert.deepEqual(
  PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS,
  gentleAction.targetFactors,
  'migration targets must be derived from the canonical action registry'
);
for (const factorKey of PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS) {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === factorKey
  );
  assert.ok(factor, `missing canonical factor ${factorKey}`);
  assert.ok(factor.contexts.includes('COMMITTED_RELATIONSHIP'));
  assert.notEqual(factor.privacyClass, 'SENSITIVE');
  assert.notEqual(factor.privacyClass, 'MATCHING_ONLY');
}

const safeLegacy = baseRow();
const safePlan = planPairEventNewOnlyMigration(safeLegacy, now);
assert.equal(safePlan.disposition, 'BIND_SAFE_EVENT');
const safeSerialized = serializedUpdate(safeLegacy);
assert.ok(safeSerialized.includes(`"factorRegistryVersion":${MVP_FACTOR_REGISTRY.registryVersion}`));
for (const factorKey of PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS) {
  assert.ok(safeSerialized.includes(factorKey));
}
assert.ok(safeSerialized.includes('"axis":""'));
assert.ok(safeSerialized.includes('"kind":"pair_lifecycle"'));
assert.equal(safeSerialized.includes('pair_created_at'), false);

const safeWeekly = baseRow({
  key: 'pair:weekly_success_celebration:2026-W32',
  category: 'behavioral_event',
  type: 'weekly_success_celebration',
  source: {
    kind: 'weekly_checkin',
    weekKey: '2026-W32',
    refId: 'raw-weekly-row',
  },
  weekly: { fatigue: 0.2, readiness: 0.8 },
});
const safeWeeklyPlan = planPairEventNewOnlyMigration(safeWeekly, now);
assert.equal(safeWeeklyPlan.disposition, 'BIND_SAFE_EVENT');
const weeklySerialized = serializedUpdate(safeWeekly);
assert.ok(weeklySerialized.includes('"kind":"weekly_pair_state"'));
assert.ok(weeklySerialized.includes('"cycleKey":"2026-W32"'));
assert.equal(weeklySerialized.includes('raw-weekly-row'), false);
assert.ok(weeklySerialized.includes('"weekly":""'));

for (const unsafeType of [
  'diagnostics_risk_focus',
  'high_fatigue_recovery',
  'weekly_divergence_repair',
  'partner_birthday',
]) {
  const unsafe = baseRow({
    type: unsafeType,
    category: unsafeType === 'diagnostics_risk_focus' ? 'system_signal' : 'behavioral_event',
    source: { kind: unsafeType === 'diagnostics_risk_focus' ? 'diagnostics' : 'weekly_checkin' },
    factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
  });
  const plan = planPairEventNewOnlyMigration(unsafe, now);
  assert.equal(
    plan.disposition,
    'RETIRE_UNSAFE_EVENT',
    `${unsafeType} must never regain a Factor binding`
  );
  const serialized = serializedUpdate(unsafe);
  assert.ok(serialized.includes('retired_legacy_signal'));
  assert.ok(serialized.includes('"status":"expired"'));
  assert.ok(serialized.includes('"canAccept":false'));
  assert.ok(serialized.includes('"factorRegistryVersion":""'));
  assert.ok(serialized.includes('"targetFactorKeys":""'));
  assert.equal(serialized.includes(unsafeType), false);
}

const mixedBinding = baseRow({
  factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
});
const mixedPlan = planPairEventNewOnlyMigration(mixedBinding, now);
assert.equal(mixedPlan.disposition, 'RETIRE_INVALID_EVENT');
assert.equal(mixedPlan.reason, 'MIXED_FACTOR_BINDING');

const invalidShape = baseRow({ title: { ru: '', en: 'Missing Russian title' } });
const invalidPlan = planPairEventNewOnlyMigration(invalidShape, now);
assert.equal(invalidPlan.disposition, 'RETIRE_INVALID_EVENT');
assert.equal(invalidPlan.reason, 'INVALID_TITLE');

const canonical = baseRow({
  source: { kind: 'pair_lifecycle' },
  factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
});
delete canonical.axis;
const canonicalPlan = planPairEventNewOnlyMigration(canonical, now);
assert.equal(canonicalPlan.disposition, 'ALREADY_CANONICAL');
assert.equal(canonicalPlan.update, undefined);

const canonicalWithResidue = baseRow({
  source: { kind: 'pair_lifecycle', weekKey: 'legacy-week' },
  factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
});
assert.equal(
  planPairEventNewOnlyMigration(canonicalWithResidue, now).disposition,
  'SCRUB_CANONICAL_EVENT'
);

const futureRegistry = baseRow({
  source: { kind: 'pair_lifecycle' },
  factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion + 1,
  targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
});
delete futureRegistry.axis;
assert.equal(
  planPairEventNewOnlyMigration(futureRegistry, now).disposition,
  'FUTURE_CONFLICT',
  'a stale migration must not overwrite a future registry binding'
);

const alreadyMigrated = baseRow({
  factorEngineCutover: {
    version: PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
    outcome: 'BOUND_SAFE_EVENT',
  },
});
assert.equal(
  planPairEventNewOnlyMigration(alreadyMigrated, now).disposition,
  'ALREADY_MIGRATED'
);

const migrationSource = readFileSync(
  join(process.cwd(), 'scripts/lib/pair-event-new-only-migration.ts'),
  'utf8'
);
for (const forbiddenCollection of [
  "collection('factor_evidence_events')",
  "collection('individual_factor_snapshots')",
  "collection('pair_factor_evaluation_snapshots')",
  'EvidenceEvent.',
  'IndividualFactorSnapshot.',
  'PairFactorEvaluationSnapshot.',
]) {
  assert.equal(
    migrationSource.includes(forbiddenCollection),
    false,
    `migration must not write ${forbiddenCollection}`
  );
}
assert.equal(
  migrationSource.includes("collection<RawPairEventForMigration>('pair_events')"),
  true,
  'pair_events must be the only migrated collection'
);

const cliSource = readFileSync(
  join(process.cwd(), 'scripts/migrate-pair-events-new-only.ts'),
  'utf8'
);
assert.ok(cliSource.includes("process.argv.includes('--apply')"));
assert.ok(cliSource.includes("requestedMode !== 'NEW_ONLY'"));
assert.ok(cliSource.includes('PAIR_EVENT_NEW_ONLY_MIGRATION_CONFIRM'));
assert.ok(cliSource.includes('APPLY_NEW_ONLY_PAIR_EVENT_MIGRATION'));

console.log('pair-event NEW_ONLY migration selfcheck passed');
