import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  currentWeekKey,
  validateWeeklyAnswers,
} from '@/domain/services/weeklyCheckIn.service';

const valid = validateWeeklyAnswers({
  closeness: 0.5,
  fatigue: 0.8,
  irritation: 0.7,
  readiness: 0.3,
  unresolvedTopic: true,
  note: 'short',
});
assert.equal(valid.fatigue, 0.8);
assert.equal(valid.unresolvedTopic, true);
assert.match(currentWeekKey(new Date('2026-06-04T00:00:00.000Z')), /^\d{4}-W\d{2}$/);
assert.throws(() =>
  validateWeeklyAnswers({
    closeness: 1.5,
    fatigue: 0,
    irritation: 0,
    readiness: 0,
    unresolvedTopic: false,
  })
);

const service = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCheckIn.service.ts'),
  'utf8'
);
assert.ok(service.includes('processWeeklyFactorCheckIn'));
assert.ok(service.includes("status: 'MATERIALIZED'"));
assert.ok(service.includes('evidenceEventIds'));
assert.ok(service.includes('individualSnapshotIds'));
assert.ok(service.includes('pairEvaluationSnapshotIds'));
assert.equal(service.includes('VectorSnapshot'), false);
assert.equal(service.includes('applyVectorDelta'), false);
assert.equal(service.includes('buildPairAnswerDiagnostics'), false);
assert.equal(service.includes('persistInsightCandidates'), false);
assert.ok(service.includes('requirePairMember'));
assert.ok(service.includes('pairIdentityFilter'));
assert.equal(service.includes('buildPairWeeklyCheckInSummary'), false);
assert.equal(service.includes('summarizePairWeeklyCheckIns'), false);
assert.equal(service.includes('toPairWeeklyCheckInPairDTO'), false);
assert.equal(service.includes('WEEKLY_CHECK_IN_DIVERGENCE_THRESHOLD'), false);
assert.equal(service.includes('summary.pair.readiness ?? 0'), false);
assert.equal(service.includes('summary.pair.fatigue ?? 1'), false);
assert.ok(service.includes('commitClaimedSubmission'));
assert.ok(service.includes("if (pair.status !== 'active')"));
assert.ok(
  service.includes(
    'beforePairLifecycleGuard: hooks.beforePrimaryCommitLifecycleGuard'
  )
);
assert.ok(service.includes('isDuplicateKeyError'));
assert.ok(service.includes('reconcileWeeklyCheckIn'));
assert.ok(service.includes('runWeeklyCheckInFinalization'));
assert.ok(service.includes("'finalization.state': 'effects_applied'"));
assert.ok(!service.includes('oldPairReadiness'));
assert.ok(!service.includes('pairData.pair.readiness?.score ?? answers.readiness'));

const route = readFileSync(
  join(process.cwd(), 'src/app/api/checkins/weekly/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('withIdempotency'));
assert.ok(!route.includes('body.userId'));

const summaryRoute = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/[id]/weekly-checkin/current/route.ts'),
  'utf8'
);
assert.ok(summaryRoute.includes('requireSession(req)'));
assert.ok(summaryRoute.includes('requirePairMember'));
assert.ok(summaryRoute.includes('weeklyCheckInService.pairCurrent'));
assert.equal(summaryRoute.includes('buildPairWeeklyCheckInSummary'), false);

const pairDashboard = readFileSync(
  join(process.cwd(), 'src/domain/services/pairDashboardSummary.service.ts'),
  'utf8'
);
assert.equal(pairDashboard.includes('includeMetrics'), false);
assert.equal(pairDashboard.includes('includePassport'), false);

const pairMeRoute = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/me/route.ts'),
  'utf8'
);
assert.equal(pairMeRoute.includes('includeMetrics'), false);
assert.equal(pairMeRoute.includes('includePassport'), false);

const pairPanel = readFileSync(
  join(process.cwd(), 'src/components/checkins/PairWeeklyCheckInPanel.tsx'),
  'utf8'
);
assert.equal(pairPanel.includes('summary.pair.divergence'), false);
assert.equal(pairPanel.includes('summary.pair.readiness'), false);
assert.equal(pairPanel.includes('summary.pair.fatigue'), false);

const pairProfile = readFileSync(
  join(process.cwd(), 'src/features/pair/PairProfilePageClient.tsx'),
  'utf8'
);
assert.equal(pairProfile.includes('data.pair.readiness?.score'), false);
assert.equal(pairProfile.includes('data.pair.fatigue?.score'), false);

const model = readFileSync(
  join(process.cwd(), 'src/models/WeeklyCheckIn.ts'),
  'utf8'
);
assert.ok(model.includes('{ userId: 1, pairId: 1, weekKey: 1 }, { unique: true }'));
assert.ok(model.includes('{ userId: 1, weekKey: 1 }'));
assert.ok(model.includes('weekly-checkin-finalization-v1'));
assert.ok(model.includes("status: 'PENDING'"));
assert.ok(model.includes('factorEngine'));
assert.match(model, /answers:\s*\{\s*type:\s*answersSchema,\s*required:\s*true,\s*immutable:\s*true\s*\}/);
assert.equal(model.includes('Schema.Types.Mixed'), false);

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrate-weekly-checkins-pair-scope.ts'),
  'utf8'
);
assert.ok(migration.includes('collection.createIndex(pairScopedKey'));
assert.ok(migration.includes('collection.dropIndex(oldUniqueIndex.name)'));

console.log('weekly selfcheck passed');
