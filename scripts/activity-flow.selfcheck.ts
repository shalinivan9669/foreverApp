import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Types } from 'mongoose';
import type { UiErrorState } from '../src/client/api/errors';
import type { PairActivityType } from '../src/models/PairActivity';
import {
  toActivityOfferDTO,
  toActivityResultSummaryDTO,
  toPairActivityDTO,
} from '../src/lib/dto/activity.dto';
import { toActivityCardVM } from '../src/client/viewmodels/activity.viewmodels';
import { DomainError } from '../src/domain/errors';
import { recommendationDecisionTransition } from '../src/domain/state/recommendationDecisionMachine';
import { recommendationCycleKey } from '../src/domain/services/recommendationDecision.service';
import {
  CONFLICT_RESOLVED_MESSAGE,
  createCheckinCompleteAttempt,
  getOrCreateCheckinCompleteAttempt,
  isConflictResolvedByRefetch,
  toCompleteRetryMessage,
} from '../src/features/activities/checkinCompleteFlow';
import {
  UNIVERSAL_ACTIVITY_COMPLETION_CHECKINS,
  activityEffectMultiplier,
  buildActivityResultSummary,
  effectiveActivityCheckIns,
  hasActivityFeedback,
  refineActivityResultSummary,
  replaceActivityAnswers,
  scaleActivityPairDeltas,
  shouldApplyActivityEffect,
} from '../src/utils/activities';

const feedback = (
  by: 'A' | 'B',
  values: [number, number, number, number]
) =>
  UNIVERSAL_ACTIVITY_COMPLETION_CHECKINS.map((checkIn, index) => ({
    checkInId: checkIn.id,
    by,
    ui: values[index],
    at: new Date('2026-06-05T00:00:00.000Z'),
  }));

const makeError = (input: Partial<UiErrorState>): UiErrorState => ({
  kind: 'generic',
  code: 'INTERNAL',
  message: 'error',
  status: 500,
  ...input,
});

const run = () => {
  const attempt = createCheckinCompleteAttempt();
  assert.ok(attempt.checkInKey.length > 0, 'checkIn key should be generated');
  assert.ok(attempt.completeKey.length > 0, 'complete key should be generated');
  assert.notEqual(
    attempt.checkInKey,
    attempt.completeKey,
    'checkIn and complete keys should be different'
  );

  const reused = getOrCreateCheckinCompleteAttempt(attempt);
  assert.equal(
    reused.checkInKey,
    attempt.checkInKey,
    'existing checkIn key should be reused on retry'
  );
  assert.equal(
    reused.completeKey,
    attempt.completeKey,
    'existing complete key should be reused on retry'
  );

  assert.equal(
    isConflictResolvedByRefetch(makeError({ status: 409, code: 'STATE_CONFLICT' })),
    true,
    '409 STATE_CONFLICT should resolve by refetch'
  );
  assert.equal(
    isConflictResolvedByRefetch(
      makeError({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' })
    ),
    false,
    '409 IDEMPOTENCY_IN_PROGRESS should remain retryable'
  );
  assert.equal(
    isConflictResolvedByRefetch(makeError({ status: 422, code: 'IDEMPOTENCY_KEY_INVALID' })),
    false,
    '422 should not be treated as resolved conflict'
  );

  const validationMessage = toCompleteRetryMessage(
    makeError({ status: 422, code: 'IDEMPOTENCY_KEY_INVALID' })
  );
  assert.match(
    validationMessage,
    /idempotency/i,
    '422 retry message should explain idempotency key issue'
  );

  const serverMessage = toCompleteRetryMessage(
    makeError({ status: 500, code: 'INTERNAL' })
  );
  assert.match(
    serverMessage,
    /Answers were saved/i,
    'server-failure message should reassure that check-in answers were saved'
  );

  const inProgressMessage = toCompleteRetryMessage(
    makeError({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' })
  );
  assert.match(
    inProgressMessage,
    /still processing/i,
    'idempotency-in-progress should give actionable retry guidance'
  );

  assert.match(
    CONFLICT_RESOLVED_MESSAGE,
    /state has already changed/i,
    'conflict resolved helper message should be user-facing'
  );

  assert.equal(
    effectiveActivityCheckIns([]).length,
    4,
    'activities without custom check-ins should use universal feedback'
  );

  const oneHigh = buildActivityResultSummary({
    checkIns: [],
    answers: feedback('A', [5, 5, 5, 2]),
  });
  assert.equal(oneHigh.status, 'completed_partial');
  assert.equal(oneHigh.submittedCount, 1);
  assert.equal(oneHigh.bothSubmitted, false);
  assert.equal(hasActivityFeedback(oneHigh), true);

  const bothHigh = buildActivityResultSummary({
    checkIns: [],
    answers: [
      ...feedback('A', [5, 5, 5, 2]),
      ...feedback('B', [5, 5, 5, 2]),
    ],
  });
  assert.equal(bothHigh.status, 'completed_success');
  assert.equal(bothHigh.bothSubmitted, true);

  const bothLow = buildActivityResultSummary({
    checkIns: [],
    answers: [
      ...feedback('A', [1, 1, 1, 1]),
      ...feedback('B', [1, 1, 1, 1]),
    ],
  });
  assert.equal(bothLow.status, 'failed');
  assert.equal(
    activityEffectMultiplier(bothLow),
    0,
    'failed activity must not receive positive vector effect'
  );

  const replaced = replaceActivityAnswers({
    existing: feedback('A', [1, 1, 1, 1]),
    incoming: UNIVERSAL_ACTIVITY_COMPLETION_CHECKINS.map((checkIn) => ({
      checkInId: checkIn.id,
      ui: checkIn.scale === 'bool' ? 2 : 5,
    })),
    role: 'A',
    at: new Date('2026-06-05T01:00:00.000Z'),
  });
  assert.equal(replaced.length, 4, 'retry should replace answers, not append');
  assert.equal(
    new Set(replaced.map((answer) => `${answer.by}:${answer.checkInId}`)).size,
    4
  );

  const recoveryDeltas = scaleActivityPairDeltas({
    result: bothHigh,
    fatigueDelta: -0.2,
    readinessDelta: 0.2,
  });
  assert.equal(recoveryDeltas.fatigueDelta, -0.08);
  assert.equal(recoveryDeltas.readinessDelta, 0.06);

  const appliedPartial = {
    ...oneHigh,
    effectApplied: true,
    effect: {
      fatigueDelta: -0.02,
      readinessDelta: 0.03,
      axisDeltas: [{ axis: 'communication' as const, delta: 0.01 }],
    },
  };
  const refined = refineActivityResultSummary({
    previous: appliedPartial,
    next: bothHigh,
  });
  assert.equal(refined.status, 'completed_success');
  assert.equal(refined.effectApplied, true);
  assert.deepEqual(refined.effect, appliedPartial.effect);
  assert.match(refined.effectExplanation.ru, /без повторного усиления эффекта/);
  assert.equal(
    shouldApplyActivityEffect(refined),
    false,
    'late peer feedback must not apply the effect twice'
  );

  const activityId = new Types.ObjectId();
  const pairId = new Types.ObjectId();
  const members: [Types.ObjectId, Types.ObjectId] = [
    new Types.ObjectId(),
    new Types.ObjectId(),
  ];
  const activity: PairActivityType & { _id: Types.ObjectId } = {
    _id: activityId,
    pairId,
    members,
    intent: 'improve',
    archetype: 'dialogue',
    axis: ['communication'],
    title: { ru: 'Проверка', en: 'Check' },
    why: { ru: 'Высокая усталость партнёра', en: 'Partner fatigue is high' },
    mode: 'together',
    sync: 'sync',
    difficulty: 1,
    intensity: 1,
    offeredAt: new Date('2026-06-05T00:00:00.000Z'),
    status: 'completed_partial',
    stateMeta: {
      templateId: 'private-template-id',
      primaryReason: 'high_fatigue',
      decisionVersion: 'activity-decision-v1',
    },
    checkIns: [],
    answers: feedback('A', [5, 5, 5, 2]),
    successScore: oneHigh.successScore,
    effect: [],
    resultSummary: appliedPartial,
    createdBy: 'system',
  };
  const dto = toPairActivityDTO(activity, { includeLegacyId: true });
  assert.equal(dto.checkIns.length, 4);
  assert.equal(dto.resultSummary?.completedAt, undefined);
  assert.equal(dto.resultSummary?.dataStatus, 'PARTIAL');
  assert.equal(
    Object.prototype.hasOwnProperty.call(dto, 'answers'),
    false,
    'activity DTO must not expose raw answers'
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(dto, 'successScore'),
    false,
    'activity DTO must not expose an exact aggregate score'
  );
  for (const field of [
    'effect',
    'fatigueDeltaOnComplete',
    'readinessDeltaOnComplete',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(dto, field),
      false,
      `activity DTO must not expose internal ${field}`
    );
  }
  assert.doesNotMatch(dto.why.ru, /усталост/i);
  assert.doesNotMatch(dto.why.en, /fatigue/i);
  for (const field of [
    'submittedBy',
    'submittedCount',
    'successScore',
    'usefulnessAvg',
    'comfortAvg',
    'tensionAvg',
    'wantsSimilarRatio',
    'effect',
    'effectExplanation',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(dto.resultSummary ?? {}, field),
      false,
      `pair-visible result must not expose ${field}`
    );
  }

  const oneDifferent = buildActivityResultSummary({
    checkIns: [],
    answers: feedback('A', [3, 3, 3, 1]),
  });
  assert.deepEqual(
    toActivityResultSummaryDTO(appliedPartial),
    toActivityResultSummaryDTO(oneDifferent),
    'different one-sided values must have the same pair-visible projection'
  );

  const card = toActivityCardVM(dto);
  assert.equal(card.resultSummary?.dataStatus, 'PARTIAL');

  const offerDto = toActivityOfferDTO(activity);
  assert.equal(offerDto.reasonCode, 'CURRENT_CYCLE_SUPPORT');
  for (const field of ['templateId', 'reward', 'source', 'reason', 'offerReason']) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(offerDto, field),
      false,
      `offer DTO must not expose ${field}`
    );
  }

  const oldActivity = {
    ...activity,
    resultSummary: undefined,
    successScore: undefined,
  };
  const oldCard = toActivityCardVM(toPairActivityDTO(oldActivity));
  assert.equal(oldCard.resultSummary, undefined);

  const activityUtilsSource = readFileSync(
    resolve(process.cwd(), 'src/utils/activities.ts'),
    'utf8'
  );
  assert.match(activityUtilsSource, /source: 'activity_completion'/);
  assert.doesNotMatch(activityUtilsSource, /source: 'manual_recalculation'/);

  const activityServiceSource = readFileSync(
    resolve(process.cwd(), 'src/domain/services/activities.service.ts'),
    'utf8'
  );
  assert.match(activityServiceSource, /ACTIVITY_FEEDBACK_REQUIRED/);
  assert.match(activityServiceSource, /ACTIVITY_RESULT_FINALIZED/);
  assert.match(activityServiceSource, /alreadyCompleted && resultSummary\.effectApplied/);
  assert.match(activityServiceSource, /toActivityResultSummaryDTO/);
  assert.match(activityServiceSource, /assertAcceptableForActivity/);
  assert.match(activityServiceSource, /markAcceptedForActivity/);
  assert.match(activityServiceSource, /markSkippedForActivity/);

  const activityOfferSource = readFileSync(
    resolve(process.cwd(), 'src/domain/services/activityOffer.service.ts'),
    'utf8'
  );
  const suggestionResultBlock = activityOfferSource.slice(
    activityOfferSource.indexOf('export type PairActivitySuggestionResult'),
    activityOfferSource.indexOf('export type RecentActivitySignals')
  );
  assert.doesNotMatch(
    suggestionResultBlock,
    /fatigue|readiness|closeness|irritation|axis|severity|sourceMeta|recentActivitySignals/i,
    'public suggestion result type must not expose internal decision evidence'
  );
  assert.match(activityOfferSource, /toPairActivitySuggestionPlanDTO\(plan\)/);

  const clientTypesSource = readFileSync(
    resolve(process.cwd(), 'src/client/api/types.ts'),
    'utf8'
  );
  const clientPlanBlock = clientTypesSource.slice(
    clientTypesSource.indexOf('export type PairActivitySuggestionPlanDTO'),
    clientTypesSource.indexOf('export type PairActivitySuggestionResponse')
  );
  assert.doesNotMatch(
    clientPlanBlock,
    /fatigue|readiness|closeness|irritation|axis|severity|sourceMeta|recentActivitySignals/i,
    'client suggestion plan must mirror the privacy-safe server projection'
  );
  assert.doesNotMatch(clientTypesSource, /OfferReasonMeta|offerReason/);

  const activityCardSource = readFileSync(
    resolve(process.cwd(), 'src/components/activities/ActivityCard.tsx'),
    'utf8'
  );
  assert.match(activityCardSource, /Старая активность — результата ещё нет/);
  assert.doesNotMatch(activityCardSource, /resultPercent|signedPercent/);

  const at = new Date('2026-08-07T12:00:00.000Z');
  assert.equal(
    recommendationDecisionTransition(
      { status: 'OFFERED', replacementDepth: 0 },
      { type: 'ACCEPT', at }
    ).next.status,
    'ACCEPTED'
  );
  assert.equal(
    recommendationDecisionTransition(
      { status: 'OFFERED', replacementDepth: 0 },
      { type: 'SKIP', at }
    ).next.status,
    'SKIPPED'
  );
  assert.equal(
    recommendationDecisionTransition(
      { status: 'OFFERED', replacementDepth: 0 },
      { type: 'REPLACE', at }
    ).next.status,
    'REPLACED'
  );
  assert.throws(
    () =>
      recommendationDecisionTransition(
        { status: 'OFFERED', replacementDepth: 1 },
        { type: 'REPLACE', at }
      ),
    (error) =>
      error instanceof DomainError &&
      error.code === 'RECOMMENDATION_REPLACEMENT_UNAVAILABLE',
    'a recommendation chain must allow at most one replacement'
  );
  assert.equal(
    recommendationCycleKey(
      { sourceMeta: { weekKey: '2026-W32' } },
      at
    ),
    '2026-W32',
    'stored cycle key should be reused deterministically'
  );

  const decisionModelSource = readFileSync(
    resolve(process.cwd(), 'src/models/RecommendationDecision.ts'),
    'utf8'
  );
  assert.match(decisionModelSource, /one_offered_recommendation_per_pair_cycle/);
  assert.match(decisionModelSource, /partialFilterExpression: \{ status: 'OFFERED' \}/);
  assert.match(decisionModelSource, /\{ activityId: 1 \}, \{ unique: true \}/);
  assert.match(decisionModelSource, /previousDecisionId/);

  const decisionServiceSource = readFileSync(
    resolve(process.cwd(), 'src/domain/services/recommendationDecision.service.ts'),
    'utf8'
  );
  const publicDtoBlock = decisionServiceSource.slice(
    decisionServiceSource.indexOf('export type RecommendationDecisionDTO'),
    decisionServiceSource.indexOf('type RecommendationOverviewDTO')
  );
  assert.doesNotMatch(
    publicDtoBlock,
    /fatigue|readiness|closeness|irritation|safety|stateMeta|templateId/i,
    'recommendation DTO must not expose internal metrics, safety state, or template metadata'
  );
  const explanationBlock = decisionServiceSource.slice(
    decisionServiceSource.indexOf('const REASON_EXPLANATIONS'),
    decisionServiceSource.indexOf('const isRecord')
  );
  assert.doesNotMatch(
    explanationBlock,
    /safety|fatigue|readiness|closeness|irritation/i,
    'public explanations must stay neutral'
  );
  assert.match(decisionServiceSource, /isPairSafetyVetoActive/);
  assert.match(decisionServiceSource, /isSafetyFallbackTemplateId/);

  const workflowSource = readFileSync(
    resolve(process.cwd(), 'src/domain/services/recommendationWorkflow.service.ts'),
    'utf8'
  );
  assert.match(workflowSource, /activityOfferService\.suggestActivities/);
  assert.match(workflowSource, /excludeTemplateId/);
  assert.match(workflowSource, /previousDecisionId/);

  const recommendationRouteSource = readFileSync(
    resolve(process.cwd(), 'src/app/api/pairs/[id]/recommendations/route.ts'),
    'utf8'
  );
  assert.match(recommendationRouteSource, /requireSession/);
  assert.match(recommendationRouteSource, /withIdempotency/);
  assert.match(recommendationRouteSource, /z\.discriminatedUnion/);

  console.log('Activity flow self-check passed.');
};

run();
