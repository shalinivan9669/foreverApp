import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import {
  PAIR_STATE_ALGORITHM_VERSION,
  WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT,
  WEEKLY_CYCLE_SUBMISSION_CLAIM_TTL_MS,
  WEEKLY_CYCLE_TIME_ZONE,
  WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
  buildPairStateProjection,
  weeklyCycleKeyForDate,
  weeklyCycleWindow,
  type PairStateCheckInInput,
} from '@/domain/services/weeklyCycle.service';
import { isRecommendationSummaryPublishable } from '@/domain/services/recommendationDecision.service';
import type {
  WeeklyFactorKey,
  WeeklyPairEvaluationMetadata,
} from '@/domain/services/factorEngineRuntime.service';

const memberA = 'member-a';
const memberB = 'member-b';
const withinCycle = new Date('2026-06-04T12:00:00.000Z');
const cycleKey = weeklyCycleKeyForDate(withinCycle);
const window = weeklyCycleWindow(cycleKey);

assert.equal(cycleKey, '2026-W23');
assert.equal(window.startsAt.toISOString(), '2026-06-01T00:00:00.000Z');
assert.equal(window.endsAt.toISOString(), '2026-06-08T00:00:00.000Z');
assert.equal(WEEKLY_CYCLE_INPUT_DEFINITION_VERSION, 'factor-registry-v2');
assert.equal(PAIR_STATE_ALGORITHM_VERSION, 'factor-engine-v2');
assert.equal(WEEKLY_CYCLE_TIME_ZONE, 'UTC');
assert.equal(WEEKLY_CYCLE_SUBMISSION_CLAIM_TTL_MS, 120_000);
assert.equal(WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT, 8);
assert.equal(
  weeklyCycleKeyForDate(new Date('2026-06-08T00:30:00.000+02:00')),
  weeklyCycleKeyForDate(new Date('2026-06-07T22:30:00.000Z')),
  'cycle identity must depend on the UTC instant, not the client offset'
);
assert.equal(weeklyCycleKeyForDate(new Date('2026-06-08T00:00:00.000Z')), '2026-W24');
assert.equal(weeklyCycleKeyForDate(new Date('2025-12-29T00:00:00.000Z')), '2026-W01');
assert.throws(() => weeklyCycleWindow('2026-W00'));
assert.throws(() => weeklyCycleWindow('2026-W54'));
assert.throws(() => weeklyCycleWindow('2025-W53'));

const first: PairStateCheckInInput = {
  _id: new Types.ObjectId(),
  userId: memberA,
  createdAt: new Date('2026-06-03T09:00:00.000Z'),
  computed: {
    factorEngine: {
      status: 'MATERIALIZED',
      registryVersion: 2,
      evidenceEventIds: ['e-a-1', 'e-a-2', 'e-a-3', 'e-a-4'],
      individualSnapshotIds: ['i-a-1', 'i-a-2', 'i-a-3', 'i-a-4'],
      pairEvaluationSnapshotIds: [],
    },
  },
};
const evaluationFor = (
  factorKey: WeeklyFactorKey,
  status: WeeklyPairEvaluationMetadata['status'],
  ordinal: number
): WeeklyPairEvaluationMetadata => ({
  snapshotId: `pair-evaluation-${ordinal}`,
  pairId: 'pair-factor-context',
  factorKey,
  revision: 0,
  context: 'COMMITTED_RELATIONSHIP',
  strategy: factorKey.includes('tension') || factorKey.includes('overload')
    ? 'TARGET_RANGE'
    : 'MINIMUM_BOTH',
  status,
  confidence: 0.8,
  reasonCodes: status === 'INSUFFICIENT_DATA' ? ['PAIR_DATA_INSUFFICIENT'] : [],
  actionability: 'AWARENESS',
  individualSnapshotIds: [`individual-a-${ordinal}`, `individual-b-${ordinal}`],
  inputHash: `input-${ordinal}`,
  outputHash: `output-${ordinal}`,
  calculatedAt: new Date('2026-06-05T09:00:00.000Z'),
});
const evaluations: readonly WeeklyPairEvaluationMetadata[] = [
  evaluationFor('communication.weekly.connection', 'ALIGNED', 1),
  evaluationFor('communication.weekly.tension', 'WORKABLE_DIFFERENCE', 2),
  evaluationFor('wellbeing.current.overload', 'TENSION', 3),
  evaluationFor('wellbeing.current.readiness', 'ALIGNED', 4),
];
const second: PairStateCheckInInput = {
  _id: new Types.ObjectId(),
  userId: memberB,
  createdAt: new Date('2026-06-05T09:00:00.000Z'),
  computed: {
    factorEngine: {
      status: 'MATERIALIZED',
      registryVersion: 2,
      evidenceEventIds: ['e-b-1', 'e-b-2', 'e-b-3', 'e-b-4'],
      individualSnapshotIds: ['i-b-1', 'i-b-2', 'i-b-3', 'i-b-4'],
      pairEvaluationSnapshotIds: evaluations.map(
        (evaluation) => evaluation.snapshotId
      ),
    },
  },
};

const empty = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(empty.dataStatus, 'NOT_READY');
assert.equal(empty.submissionCount, 0);
assert.equal(empty.signals.length, 0);

const firstPartial = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(firstPartial.dataStatus, 'PARTIAL');
assert.equal(firstPartial.submissionCount, 1);
assert.equal(firstPartial.signals.length, 0);
assert.equal(
  isRecommendationSummaryPublishable(firstPartial),
  false,
  'a partial canonical snapshot cannot open a recommendation'
);
assert.equal(
  firstPartial.memberCompletion.find((member) => member.userId === memberA)?.status,
  'SUBMITTED'
);
assert.equal(
  firstPartial.memberCompletion.find((member) => member.userId === memberB)?.status,
  'PENDING'
);

const secondPartial = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [second],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(secondPartial.dataStatus, 'PARTIAL');
assert.equal(secondPartial.submissionCount, 1);
assert.equal(secondPartial.signals.length, 0);

const firstThenSecond = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  evaluations,
  endsAt: window.endsAt,
  now: withinCycle,
});
const secondThenFirst = buildPairStateProjection({
  cycleKey,
  members: [memberB, memberA],
  checkIns: [second, first],
  evaluations: [...evaluations].reverse(),
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(firstThenSecond.dataStatus, 'ENOUGH');
assert.equal(firstThenSecond.submissionCount, 2);
assert.equal(firstThenSecond.signals.length, 4);
const discussionProjection = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  evaluations: evaluations.map((evaluation) =>
    evaluation.factorKey === 'communication.weekly.connection'
      ? { ...evaluation, status: 'REQUIRES_DISCUSSION' as const }
      : evaluation
  ),
  endsAt: window.endsAt,
  now: withinCycle,
});
const discussionSignal = discussionProjection.signals.find(
  (signal) => signal.key === 'connection'
);
assert.equal(discussionSignal?.status, 'MIXED');
assert.equal(discussionSignal?.reasonCode, 'DIFFERENT_EXPERIENCE');
assert.equal(discussionSignal?.nextStepHint, 'CHOOSE_LOW_EFFORT');
assert.equal(
  isRecommendationSummaryPublishable(firstThenSecond),
  true,
  'an ENOUGH canonical snapshot may open a recommendation'
);
assert.deepEqual(secondThenFirst, firstThenSecond);
assert.notEqual(
  firstPartial.inputHash,
  firstThenSecond.inputHash,
  'a late second immutable evidence revision must produce a new canonical input'
);

const skipped = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [],
  previousMemberCompletion: [
    { userId: memberA, status: 'SKIPPED' },
    { userId: memberB, status: 'PENDING' },
  ],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(
  skipped.memberCompletion.find((member) => member.userId === memberA)?.status,
  'SKIPPED'
);
assert.equal(skipped.dataStatus, 'NOT_READY');
assert.equal(skipped.signals.length, 0);
assert.notEqual(skipped.inputHash, empty.inputHash);

const skippedWithPeerSubmission = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [second],
  previousMemberCompletion: skipped.memberCompletion,
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(skippedWithPeerSubmission.dataStatus, 'INSUFFICIENT');
assert.equal(skippedWithPeerSubmission.signals.length, 0);
assert.equal(
  isRecommendationSummaryPublishable(skippedWithPeerSubmission),
  true,
  'a terminal resolved INSUFFICIENT snapshot may use the fallback path'
);
assert.equal(
  skippedWithPeerSubmission.memberCompletion.find(
    (member) => member.userId === memberB
  )?.status,
  'SUBMITTED'
);

const terminalSkipFencesOrphanEvidence = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first],
  previousMemberCompletion: skipped.memberCompletion,
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(
  terminalSkipFencesOrphanEvidence.memberCompletion.find(
    (member) => member.userId === memberA
  )?.status,
  'SKIPPED'
);
assert.equal(terminalSkipFencesOrphanEvidence.submissionCount, 0);
assert.deepEqual(terminalSkipFencesOrphanEvidence.evidenceRevisionIds, []);
assert.equal(terminalSkipFencesOrphanEvidence.signals.length, 0);

const insufficient = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  evaluations: evaluations.map((evaluation) =>
    evaluation.factorKey === 'wellbeing.current.readiness'
      ? { ...evaluation, status: 'INSUFFICIENT_DATA' as const }
      : evaluation
  ),
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(insufficient.dataStatus, 'INSUFFICIENT');
assert.equal(insufficient.signals.length, 0);

const expired = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  evaluations,
  endsAt: window.endsAt,
  now: new Date('2026-06-08T00:00:00.000Z'),
});
assert.equal(expired.cycleStatus, 'EXPIRED');
assert.equal(expired.dataStatus, 'ENOUGH');
assert.equal(expired.signals.length, 4);
assert.deepEqual(
  expired.signals,
  firstThenSecond.signals,
  'window expiry must not erase an already sufficient safe summary'
);
assert.notEqual(
  expired.inputHash,
  firstThenSecond.inputHash,
  'cycle expiry must produce a distinct immutable fallback revision'
);

const expiredWithoutEvidence = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [],
  endsAt: window.endsAt,
  now: new Date('2026-06-08T00:00:00.000Z'),
});
assert.equal(expiredWithoutEvidence.cycleStatus, 'EXPIRED');
assert.equal(expiredWithoutEvidence.dataStatus, 'INSUFFICIENT');
assert.deepEqual(expiredWithoutEvidence.reasonCodes, ['CYCLE_EXPIRED']);
assert.deepEqual(
  expiredWithoutEvidence.memberCompletion.map((member) => member.status),
  ['EXPIRED', 'EXPIRED']
);
assert.equal(expiredWithoutEvidence.signals.length, 0);

const expiredPartial = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first],
  endsAt: window.endsAt,
  now: new Date('2026-06-08T00:00:00.000Z'),
});
assert.equal(expiredPartial.cycleStatus, 'EXPIRED');
assert.equal(expiredPartial.dataStatus, 'INSUFFICIENT');
assert.equal(expiredPartial.signals.length, 0);
assert.deepEqual(
  expiredPartial.memberCompletion.map((member) => member.status),
  ['SUBMITTED', 'EXPIRED']
);

const pairProjectionJson = JSON.stringify({
  ready: firstThenSecond,
  skipped,
  expired: expiredWithoutEvidence,
});
for (const forbiddenField of [
  'answers',
  'note',
  'closeness',
  'fatigue',
  'irritation',
  'readiness',
  'skipReason',
  'submissionClaims',
  'token',
]) {
  assert.equal(pairProjectionJson.includes(`"${forbiddenField}"`), false);
}

const cycleModel = readFileSync(
  join(process.cwd(), 'src/models/WeeklyCycle.ts'),
  'utf8'
);
assert.ok(cycleModel.includes('{ pairId: 1, cycleKey: 1 }, { unique: true })'));
assert.ok(cycleModel.includes("'NOT_READY'"));
assert.ok(cycleModel.includes("'PARTIAL'"));
assert.ok(cycleModel.includes("'SKIPPED'"));
assert.ok(cycleModel.includes("'EXPIRED'"));
assert.ok(cycleModel.includes("timeZone: 'UTC'"));
assert.ok(cycleModel.includes('submissionClaims'));
assert.ok(cycleModel.includes('select: false'));
assert.ok(cycleModel.includes('expiredReconciliationCompletedAt?: Date'));
assert.ok(cycleModel.includes('weekly_cycle_pending_expired_reconciliation'));
assert.ok(
  cycleModel.includes('expiredReconciliationCompletedAt: 1,')
);
assert.ok(!cycleModel.includes('WAITING_A'));
assert.ok(!cycleModel.includes('WAITING_B'));

const snapshotModel = readFileSync(
  join(process.cwd(), 'src/models/PairStateSnapshot.ts'),
  'utf8'
);
assert.ok(snapshotModel.includes('{ cycleId: 1, revision: 1 }, { unique: true })'));
assert.ok(snapshotModel.includes("{ cycleId: 1, 'input.hash': 1, 'algorithm.version': 1 }"));
assert.ok(snapshotModel.includes('immutable: true'));
assert.ok(snapshotModel.includes("timeZone: 'UTC'"));
assert.ok(snapshotModel.includes("'SKIPPED'"));
assert.ok(snapshotModel.includes("'EXPIRED'"));
assert.equal(snapshotModel.includes('answers'), false);
assert.equal(snapshotModel.includes('note'), false);
assert.equal(snapshotModel.includes('submissionClaims'), false);
assert.equal(snapshotModel.includes('token'), false);
assert.equal(snapshotModel.includes('skipReason'), false);

const cycleService = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCycle.service.ts'),
  'utf8'
);
assert.ok(cycleService.includes('PairStateSnapshot.create'));
assert.ok(cycleService.includes('isDuplicateKeyError'));
assert.ok(cycleService.includes('for (let attempt = 0; attempt < 5; attempt += 1)'));
assert.ok(cycleService.includes('submissionCount: { $lte: projection.submissionCount }'));
assert.ok(cycleService.includes("$elemMatch: { userId, status: 'PENDING' }"));
assert.equal(
  cycleService.includes("$elemMatch: { userId, status: { $ne: 'SUBMITTED' } }"),
  false,
  'orphan evidence must not overwrite terminal member completion'
);
assert.ok(cycleService.includes('randomUUID()'));
assert.ok(cycleService.includes('WEEKLY_CYCLE_SUBMISSION_CLAIM_TTL_MS'));
assert.ok(cycleService.includes('$push:'));
assert.ok(cycleService.includes('submissionClaims'));
assert.ok(cycleService.includes('token: input.token'));
assert.ok(
  (cycleService.match(/memberCompletion: projection\.memberCompletion/g) ?? [])
    .length >= 2,
  'mutable readiness and latest snapshot pointer must both CAS member completion'
);
assert.ok(cycleService.includes("code: 'WEEKLY_CYCLE_EXPIRED'"));
assert.ok(cycleService.includes("code: 'WEEKLY_CYCLE_NOT_STARTED'"));
assert.ok(cycleService.includes('now.getTime() < window.startsAt.getTime()'));
assert.ok(cycleService.includes("'WEEKLY_CYCLE_SUBMISSION_IN_PROGRESS'"));
assert.equal(cycleService.includes('PairStateSnapshot.findOneAndUpdate'), false);
assert.ok(cycleService.includes('findUnfinalizedExpiredCycles'));
const reconciliationFinderStart = cycleService.indexOf(
  'const findUnfinalizedExpiredCycles'
);
const reconciliationFinalizerStart = cycleService.indexOf(
  'const finalizeExpiredPairCycles'
);
assert.ok(
  reconciliationFinderStart >= 0 &&
    reconciliationFinalizerStart > reconciliationFinderStart
);
const reconciliationFinder = cycleService.slice(
  reconciliationFinderStart,
  reconciliationFinalizerStart
);
assert.match(reconciliationFinder, /WeeklyCycle\.find\(/);
assert.match(reconciliationFinder, /expiredReconciliationCompletedAt: null/);
assert.match(
  reconciliationFinder,
  /\.limit\(WEEKLY_CYCLE_EXPIRED_RECONCILIATION_BATCH_LIMIT\)/
);
assert.match(
  reconciliationFinder,
  /\.hint\(WEEKLY_CYCLE_PENDING_RECONCILIATION_INDEX\)/
);
assert.doesNotMatch(reconciliationFinder, /aggregate|\$lookup/);
assert.ok(
  cycleService.includes('$set: { expiredReconciliationCompletedAt: now }')
);
assert.ok(cycleService.includes("code: 'EXPIRED_RECONCILIATION_FAILED'"));
assert.ok(cycleService.includes("allowedStatuses: ['active', 'paused', 'ended']"));
assert.ok(cycleService.includes("status: 'EXPIRED'"));
assert.ok(cycleService.includes('historicalEnded: pair.status === \'ended\''));
assert.ok(cycleService.includes('suppressNotifications: input.historicalEnded'));
assert.ok(cycleService.includes('canonicalSnapshotId'));
assert.ok(cycleService.includes('projectionFromSnapshot(canonicalSnapshot)'));
assert.ok(cycleService.includes("type: 'CYCLE_AVAILABLE'"));
assert.ok(cycleService.includes("type: 'SUMMARY_READY'"));
assert.ok(cycleService.includes('session: input.session'));
assert.ok(cycleService.includes('$inc: { lifecycleRevision: 1 }'));
assert.ok(cycleService.includes('status: projection.cycleStatus'));
assert.ok(cycleService.includes('pairReadiness: projection.dataStatus'));
assert.equal(
  cycleService.includes('return { cycle: refreshedCycle, snapshot, projection }'),
  false,
  'materialization must return the snapshot selected by latestSnapshotId'
);
const claimSection = cycleService.slice(
  cycleService.indexOf('async claimSubmission'),
  cycleService.indexOf('async releaseSubmissionClaim')
);
assert.ok(claimSection.includes('$push:'));
assert.ok(claimSection.includes('submissionClaims'));
assert.ok(claimSection.includes('expiresAt: { $gt: now }'));
assert.equal(
  claimSection.includes("'memberCompletion.$.status': 'SUBMITTED'"),
  false,
  'a transient lease must not impersonate completed evidence'
);
const releaseSection = cycleService.slice(
  cycleService.indexOf('async releaseSubmissionClaim'),
  cycleService.indexOf('async commitClaimedSubmission')
);
assert.ok(releaseSection.includes('$pull:'));
assert.ok(releaseSection.includes('token: input.token'));
assert.equal(releaseSection.includes("status': 'PENDING'"), false);
const commitSection = cycleService.slice(
  cycleService.indexOf('async commitClaimedSubmission'),
  cycleService.indexOf('async finalizeExpiredCycles')
);
assert.ok(commitSection.includes('session.withTransaction'));
assert.ok(commitSection.includes("status: 'OPEN'"));
assert.ok(commitSection.includes('endsAt: { $gt: commitNow }'));
assert.ok(commitSection.includes('token: input.token'));
assert.ok(commitSection.includes('expiresAt: { $gt: commitNow }'));
assert.ok(commitSection.includes("'member.status': 'PENDING'"));
assert.ok(commitSection.includes('WeeklyCheckIn.create'));
assert.ok(commitSection.includes('{ session }'));
const lifecycleGuardPosition = commitSection.indexOf(
  'const activePair = await Pair.findOneAndUpdate'
);
const cycleCommitPosition = commitSection.indexOf(
  'const claimedCycle = await WeeklyCycle.findOneAndUpdate'
);
const checkInCommitPosition = commitSection.indexOf(
  'const created = await WeeklyCheckIn.create'
);
assert.ok(lifecycleGuardPosition > commitSection.indexOf('session.withTransaction'));
assert.ok(cycleCommitPosition > lifecycleGuardPosition);
assert.ok(checkInCommitPosition > cycleCommitPosition);
assert.ok(commitSection.includes('members: input.currentUserId'));
assert.ok(commitSection.includes("status: 'active'"));
assert.ok(commitSection.includes('beforePairLifecycleGuard'));
const skipSection = cycleService.slice(cycleService.indexOf('async skipCurrent'));
assert.ok(skipSection.includes('expiresAt: { $gt: now }'));
assert.ok(skipSection.includes("'memberCompletion.$.status': 'SKIPPED'"));

const weeklyService = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCheckIn.service.ts'),
  'utf8'
);
assert.ok((weeklyService.match(/syncAfterCheckIn/g) ?? []).length >= 1);
assert.ok(weeklyService.includes('runWeeklyCheckInFinalization'));
assert.ok(weeklyService.includes('processWeeklyFactorCheckIn'));
assert.equal(weeklyService.includes('VectorSnapshot'), false);
assert.equal(weeklyService.includes('buildPairAnswerDiagnostics'), false);
assert.ok(weeklyService.includes('submissionClaimToken'));
assert.ok(weeklyService.includes('token: submissionClaimToken'));
assert.ok(weeklyService.includes('commitClaimedSubmission'));
assert.ok(
  weeklyService.includes(
    'beforePairLifecycleGuard: hooks.beforePrimaryCommitLifecycleGuard'
  )
);

assert.ok(cycleService.includes('readLatestInternalWeeklyPairEvaluations'));
assert.ok(cycleService.includes('pairEvaluationSnapshotIds'));
assert.equal(cycleService.includes("'answers.closeness'"), false);
assert.equal(cycleService.includes("'answers.fatigue'"), false);

const route = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/[id]/weekly-cycle/current/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('requirePairMember'));
assert.ok(route.includes('weeklyCycleService.current'));
assert.ok(route.includes('export async function POST'));
assert.ok(route.includes('weeklyCycleService.skipCurrent'));
assert.ok(route.includes('withIdempotency'));
assert.ok(route.includes('enforceRateLimit'));
assert.ok(route.includes('requestBody: { cycleKey }'));
assert.ok(route.includes("z.object({}).strict()"));
assert.equal(route.includes('skipReason'), false);
assert.equal(route.includes('body.reason'), false);

const pairPanel = readFileSync(
  join(process.cwd(), 'src/components/checkins/PairWeeklyCheckInPanel.tsx'),
  'utf8'
);
assert.ok(pairPanel.includes('Цикл завершён; ответ задним числом не требуется.'));
assert.ok(pairPanel.includes('Индивидуальные ответы остаются личными.'));
assert.equal(pairPanel.includes('Оба check-in получены'), false);

const recommendationService = readFileSync(
  join(process.cwd(), 'src/domain/services/recommendationDecision.service.ts'),
  'utf8'
);
assert.ok(recommendationService.includes('RECOMMENDATION_SUMMARY_NOT_READY'));
assert.ok(recommendationService.includes('latestSnapshotId'));
assert.ok(recommendationService.includes('recommendationContextIsStillCanonical'));
assert.ok(recommendationService.includes('inputHash: snapshot.input.hash'));

const recommendationProvenanceModel = readFileSync(
  join(process.cwd(), 'src/models/RecommendationProvenance.ts'),
  'utf8'
);
assert.ok(recommendationProvenanceModel.includes('snapshotId'));
assert.ok(recommendationProvenanceModel.includes('activityContentHash'));
assert.equal(recommendationProvenanceModel.includes('evidenceRevisionIds'), false);

console.log('weekly-cycle selfcheck passed');
