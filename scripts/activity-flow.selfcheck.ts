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
import { activityTransition } from '../src/domain/state/activityMachine';
import {
  isRecommendationSummaryPublishable,
  recommendationCycleKey,
} from '../src/domain/services/recommendationDecision.service';
import {
  buildActivityContentHash,
  buildRecommendationProvenance,
} from '../src/domain/services/recommendationProvenance.service';
import {
  hasP0SensitiveActivityAxis,
  isActivityAccessibleToRole,
  isActivityEligibleForSafetyState,
} from '../src/domain/services/activityEligibility.service';
import {
  CONFLICT_RESOLVED_MESSAGE,
  createCheckinCompleteAttempt,
  getOrCreateCheckinCompleteAttempt,
  isConflictResolvedByRefetch,
  toCompleteRetryMessage,
} from '../src/features/activities/checkinCompleteFlow';
import {
  CANONICAL_ACTIVITY_FEEDBACK_CHECKINS,
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
  const canonicalFeedback = effectiveActivityCheckIns(
    [],
    'activity-feedback-v2'
  );
  assert.deepEqual(
    canonicalFeedback.map((checkIn) => checkIn.id),
    [
      'participated',
      'usefulness',
      'subjective_change',
      'difficulty',
      'repeat_intent',
    ],
    'new activities must require the canonical feedback schema'
  );
  assert.equal(
    new Set(canonicalFeedback.map((checkIn) => checkIn.id)).size,
    CANONICAL_ACTIVITY_FEEDBACK_CHECKINS.length,
    'canonical feedback ids must be unique'
  );
  const canonicalAnswers = canonicalFeedback.map((checkIn) => ({
    checkInId: checkIn.id,
    by: 'A' as const,
    ui: checkIn.scale === 'bool' ? 2 : 4,
    at: new Date('2026-06-05T00:00:00.000Z'),
  }));
  const canonicalResult = buildActivityResultSummary({
    checkIns: canonicalFeedback,
    answers: canonicalAnswers,
    feedbackSchemaVersion: 'activity-feedback-v2',
  });
  assert.equal(canonicalResult.feedbackSchemaVersion, 'activity-feedback-v2');
  assert.equal(typeof canonicalResult.participationRatio, 'number');
  assert.equal(typeof canonicalResult.subjectiveChangeAvg, 'number');
  assert.equal(typeof canonicalResult.difficultyAvg, 'number');
  assert.equal(typeof canonicalResult.wantsSimilarRatio, 'number');

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
      sourceMeta: {
        trigger: 'pair_event',
        eventType: 'weekly_divergence_repair',
        divergenceMetric: 'readiness',
      },
    },
    checkIns: [],
    answers: feedback('A', [5, 5, 5, 2]),
    successScore: oneHigh.successScore,
    effect: [],
    resultSummary: appliedPartial,
    createdBy: 'system',
  };
  const provenance = buildRecommendationProvenance({
    context: {
      cycleId: new Types.ObjectId(),
      cycleKey: '2026-W23',
      snapshotId: new Types.ObjectId(),
      snapshotRevision: 2,
      inputHash: 'a'.repeat(64),
      inputDefinitionVersion: 'weekly-checkin-v1',
      pairStateAlgorithmVersion: 'pair-state-v1',
    },
    activity,
  });
  assert.equal(provenance.recommendationRuleVersion, 'recommendation-rule-v2');
  assert.equal(provenance.activityContentHash, buildActivityContentHash(activity));
  assert.notEqual(
    provenance.activityContentHash,
    buildActivityContentHash({
      ...activity,
      title: { ...activity.title, en: 'Changed content' },
    }),
    'activity content mutation must change immutable provenance'
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(provenance, 'evidenceRevisionIds'),
    false,
    'recommendation provenance must not copy raw evidence references'
  );
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
    'consentA',
    'consentB',
    'visibility',
    'recommendationProvenance',
    'lifecycleVersion',
    'feedbackSchemaVersion',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(dto, field),
      false,
      `activity DTO must not expose internal ${field}`
    );
  }
  assert.doesNotMatch(dto.why.ru, /усталост/i);
  assert.doesNotMatch(dto.why.en, /fatigue/i);
  assert.deepEqual(
    dto.eventSource,
    { trigger: 'pair_event' },
    'pair-visible event source must not expose internal event evidence'
  );
  assert.equal(
    toPairActivityDTO({ ...activity, mode: 'soloA' }).mode,
    'solo',
    'participant DTO must not reveal which pair role owns a solo activity'
  );
  const privateSolo = {
    ...activity,
    mode: 'soloA' as const,
    visibility: 'privateA' as const,
    stateMeta: {
      ...activity.stateMeta,
      assignedMemberIds: [String(members[0])],
    },
  };
  assert.equal(isActivityAccessibleToRole(privateSolo, 'A'), true);
  assert.equal(isActivityAccessibleToRole(privateSolo, 'B'), false);
  assert.equal(hasP0SensitiveActivityAxis(['finance']), true);
  assert.equal(hasP0SensitiveActivityAxis(['communication']), false);
  assert.equal(
    isActivityEligibleForSafetyState(
      { stateMeta: { templateId: 'system-resource-relief' } },
      true
    ),
    true
  );
  assert.equal(
    isActivityEligibleForSafetyState(
      { stateMeta: { templateId: 'system-communication-listen' } },
      true
    ),
    false
  );
  for (const field of [
    'submittedBy',
    'submittedCount',
    'successScore',
    'usefulnessAvg',
    'comfortAvg',
    'tensionAvg',
    'wantsSimilarRatio',
    'participationRatio',
    'subjectiveChangeAvg',
    'difficultyAvg',
    'feedbackSchemaVersion',
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
  assert.match(activityServiceSource, /async startActivity/);
  assert.match(activityServiceSource, /type: 'START'/);
  assert.match(activityServiceSource, /activity\.accept_noop/);
  assert.match(activityServiceSource, /if \(outcome\.alreadyAccepted\) return \{\};/);
  assert.match(activityServiceSource, /event: 'ACTIVITY_STARTED'/);
  assert.match(activityServiceSource, /alreadyCompleted && resultSummary\.effectApplied/);
  assert.match(activityServiceSource, /toActivityResultSummaryDTO/);
  assert.match(activityServiceSource, /claimAcceptedForActivity/);
  assert.match(activityServiceSource, /claimSkippedForActivity/);
  assert.match(activityServiceSource, /mongoose\.startSession/);
  assert.match(activityServiceSource, /session\.withTransaction/);
  assert.match(activityServiceSource, /session,/);
  const acceptClaimIndex = activityServiceSource.indexOf('claimAcceptedForActivity');
  const acceptSaveIndex = activityServiceSource.indexOf(
    'await data.activity.save({ session })',
    acceptClaimIndex
  );
  assert.ok(
    acceptClaimIndex >= 0 && acceptSaveIndex > acceptClaimIndex,
    'accept must claim the decision before saving the linked activity in one transaction'
  );
  const skipClaimIndex = activityServiceSource.indexOf('claimSkippedForActivity');
  const skipSaveIndex = activityServiceSource.indexOf(
    'await data.activity.save({ session })',
    skipClaimIndex
  );
  assert.ok(
    skipClaimIndex >= 0 && skipSaveIndex > skipClaimIndex,
    'cancel must claim the decision before saving the linked activity in one transaction'
  );
  const checkedInAudit = activityServiceSource.slice(
    activityServiceSource.indexOf("event: 'ACTIVITY_CHECKED_IN'"),
    activityServiceSource.indexOf('async completeActivity', skipSaveIndex)
  );
  assert.doesNotMatch(
    checkedInAudit,
    /answersCount|success:|submittedCount|fatigueDelta|readinessDelta/,
    'activity feedback audit metadata must not contain exact or reconstructable values'
  );
  const completedAudit = activityServiceSource.slice(
    activityServiceSource.indexOf("event: 'ACTIVITY_COMPLETED'"),
    activityServiceSource.indexOf(
      'return outcome.response',
      activityServiceSource.indexOf("event: 'ACTIVITY_COMPLETED'")
    )
  );
  assert.doesNotMatch(
    completedAudit,
    /success:|submittedCount|fatigueDelta|readinessDelta/,
    'activity completion audit metadata must stay qualitative'
  );

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
  assert.match(
    activityOfferSource,
    /assignedMemberIds/,
    'legacy A/B template modes must be bound to concrete persisted member ids'
  );
  assert.match(activityOfferSource, /hasP0SensitiveActivityAxis/);
  assert.match(activityOfferSource, /isOfferedActivityEligibleForRole/);
  assert.match(activityOfferSource, /if \(!isSafetyFallbackTemplateId\(input\.templateId\)\)/);
  assert.match(activityOfferSource, /Pair\.updateOne\(/);
  assert.match(activityOfferSource, /offeredInTransaction/);
  assert.match(activityOfferSource, /availableSlots/);
  assert.match(activityOfferSource, /activity-lifecycle-v2/);
  assert.match(activityOfferSource, /activity-feedback-v2/);
  assert.match(activityOfferSource, /buildRecommendationProvenance/);

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
  const transitionContext = { currentUserId: 'member-a', role: 'A' as const };
  const started = activityTransition(
    {
      status: 'accepted',
      lifecycleVersion: 'activity-lifecycle-v2',
      answers: [],
    },
    { type: 'START', at },
    transitionContext
  );
  assert.equal(started.next.status, 'in_progress');
  assert.equal(started.next.startedAt, at);
  const startRetry = activityTransition(
    {
      status: 'in_progress',
      lifecycleVersion: 'activity-lifecycle-v2',
      startedAt: at,
      answers: [],
    },
    { type: 'START', at: new Date(at.getTime() + 1_000) },
    transitionContext
  );
  assert.equal(startRetry.next.status, 'in_progress');
  assert.equal(startRetry.next.startedAt, at, 'start retry must retain first start');
  assert.throws(
    () =>
      activityTransition(
        {
          status: 'accepted',
          lifecycleVersion: 'activity-lifecycle-v2',
          answers: [],
        },
        {
          type: 'CHECKIN',
          at,
          answers: canonicalFeedback.map((checkIn) => ({
            checkInId: checkIn.id,
            ui: checkIn.scale === 'bool' ? 2 : 4,
          })),
        },
        transitionContext
      ),
    (error) => error instanceof DomainError && error.code === 'STATE_CONFLICT',
    'v2 activity must be started before feedback'
  );
  const awaitingFeedback = activityTransition(
    {
      status: 'in_progress',
      lifecycleVersion: 'activity-lifecycle-v2',
      startedAt: at,
      answers: [],
    },
    {
      type: 'CHECKIN',
      at,
      answers: canonicalFeedback.map((checkIn) => ({
        checkInId: checkIn.id,
        ui: checkIn.scale === 'bool' ? 2 : 4,
      })),
    },
    transitionContext
  );
  assert.equal(awaitingFeedback.next.status, 'awaiting_feedback');
  assert.equal(
    activityTransition(
      {
        status: 'accepted',
        lifecycleVersion: 'activity-lifecycle-v1',
        answers: [],
      },
      {
        type: 'CHECKIN',
        at,
        answers: [{ checkInId: 'legacy', ui: 1 }],
      },
      transitionContext
    ).next.status,
    'awaiting_checkin',
    'legacy accepted activities keep implicit-start compatibility'
  );

  assert.equal(
    isRecommendationSummaryPublishable({
      dataStatus: 'NOT_READY',
      memberCompletion: [
        { userId: 'member-a', status: 'PENDING' },
        { userId: 'member-b', status: 'PENDING' },
      ],
    }),
    false,
    'recommendation must be rejected before pair input exists'
  );
  assert.equal(
    isRecommendationSummaryPublishable({
      dataStatus: 'PARTIAL',
      memberCompletion: [
        { userId: 'member-a', status: 'SUBMITTED' },
        { userId: 'member-b', status: 'PENDING' },
      ],
    }),
    false,
    'recommendation must be rejected for a partial summary'
  );
  assert.equal(
    isRecommendationSummaryPublishable({
      dataStatus: 'ENOUGH',
      memberCompletion: [
        { userId: 'member-a', status: 'SUBMITTED' },
        { userId: 'member-b', status: 'SUBMITTED' },
      ],
    }),
    true
  );
  assert.equal(
    isRecommendationSummaryPublishable({
      dataStatus: 'INSUFFICIENT',
      memberCompletion: [
        { userId: 'member-a', status: 'SUBMITTED' },
        { userId: 'member-b', status: 'PENDING' },
      ],
    }),
    false,
    'insufficient data is not publishable while a participant remains pending'
  );
  assert.equal(
    isRecommendationSummaryPublishable({
      dataStatus: 'INSUFFICIENT',
      memberCompletion: [
        { userId: 'member-a', status: 'SKIPPED' },
        { userId: 'member-b', status: 'SUBMITTED' },
      ],
    }),
    true,
    'resolved insufficient data is an allowed terminal fallback'
  );
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
  assert.throws(
    () =>
      recommendationDecisionTransition(
        { status: 'ACCEPTED', replacementDepth: 0 },
        { type: 'REPLACE', at }
      ),
    (error) =>
      error instanceof DomainError && error.code === 'RECOMMENDATION_UNAVAILABLE',
    'accept must win atomically over a concurrent replacement'
  );
  assert.throws(
    () =>
      recommendationDecisionTransition(
        { status: 'REPLACED', replacementDepth: 0 },
        { type: 'ACCEPT', at }
      ),
    (error) =>
      error instanceof DomainError && error.code === 'RECOMMENDATION_UNAVAILABLE',
    'replacement must win atomically over a concurrent accept'
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
  assert.match(decisionModelSource, /RecommendationProvenanceSchema/);

  const provenanceModelSource = readFileSync(
    resolve(process.cwd(), 'src/models/RecommendationProvenance.ts'),
    'utf8'
  );
  assert.match(provenanceModelSource, /snapshotId/);
  assert.match(provenanceModelSource, /inputHash/);
  assert.match(provenanceModelSource, /recommendationRuleVersion/);
  assert.match(provenanceModelSource, /activityContentHash/);
  assert.match(provenanceModelSource, /immutable: true/);
  assert.doesNotMatch(provenanceModelSource, /answers|evidenceRevisionIds/);

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
  assert.match(decisionServiceSource, /isActivityEligibleForSafetyState/);
  assert.match(decisionServiceSource, /if \(!decision\) return unavailable\(\)/);
  assert.match(decisionServiceSource, /status: \{ \$in: ACTIVE_ACTIVITY_STATUSES \}/);
  assert.match(decisionServiceSource, /transitionStored\(decision, \{ type: 'ACCEPT', at: now \}, session\)/);
  assert.match(decisionServiceSource, /_id: decision\._id, status: decision\.status/);
  assert.match(decisionServiceSource, /claimAcceptedForActivity/);
  assert.match(decisionServiceSource, /claimSkippedForActivity/);
  assert.match(decisionServiceSource, /RECOMMENDATION_SUMMARY_NOT_READY/);
  assert.match(decisionServiceSource, /latestSnapshotId/);
  assert.match(decisionServiceSource, /isRecommendationSummaryPublishable/);
  assert.match(decisionServiceSource, /recommendationContextIsStillCanonical/);
  assert.match(decisionServiceSource, /reserveReplacementSuccessor/);
  assert.match(decisionServiceSource, /successorDecisionId: String/);
  assert.match(
    decisionServiceSource,
    /decisionId: String\(successor\._id\)[\s\S]*ensureActionNotification\(pair, validatedSuccessor\)/,
    'an existing replacement successor must be revalidated and its notification reconciled'
  );
  assert.match(
    decisionServiceSource,
    /preservedDecisionId \? \{ _id: \{ \$ne: preservedDecisionId \} \} : \{\}/,
    'a concurrent retry must not expire the reserved successor'
  );
  assert.match(
    decisionServiceSource,
    /activity\.status === 'offered' && decision\.status !== 'OFFERED'/,
    'terminal decision reads must self-heal an interrupted activity write'
  );

  const workflowSource = readFileSync(
    resolve(process.cwd(), 'src/domain/services/recommendationWorkflow.service.ts'),
    'utf8'
  );
  assert.match(workflowSource, /activityOfferService\.suggestActivities/);
  assert.match(workflowSource, /excludeTemplateId/);
  assert.match(workflowSource, /previousDecisionId/);
  assert.match(workflowSource, /successorDecisionId/);
  assert.match(workflowSource, /afterReplacementPrepared/);
  assert.match(workflowSource, /suggestCompatibility/);
  assert.match(workflowSource, /offersCompatibility/);
  assert.match(workflowSource, /nextCompatibility/);
  assert.match(workflowSource, /fromTemplateCompatibility/);
  const summaryGateIndex = workflowSource.indexOf(
    'requireCurrentPublishableSummary'
  );
  const suggestionCreateIndex = workflowSource.indexOf(
    'activityOfferService.suggestActivities'
  );
  assert.ok(
    summaryGateIndex >= 0 && suggestionCreateIndex > summaryGateIndex,
    'canonical summary gate must run before an activity offer is created'
  );
  assert.match(
    workflowSource,
    /decision\.activity\.id !== activityId[\s\S]*status: 'cancelled'/,
    'a losing concurrent compatibility offer must be cancelled'
  );

  const compatibilityRoutePaths = [
    'src/app/api/pairs/[id]/suggest/route.ts',
    'src/app/api/pairs/[id]/activities/suggest/route.ts',
    'src/app/api/activities/next/route.ts',
    'src/app/api/pairs/[id]/activities/from-template/route.ts',
  ];
  for (const routePath of compatibilityRoutePaths) {
    const routeSource = readFileSync(resolve(process.cwd(), routePath), 'utf8');
    assert.match(routeSource, /recommendationWorkflowService/);
    assert.doesNotMatch(
      routeSource,
      /activityOfferService/,
      `${routePath} must not expose a non-canonical activity offer`
    );
  }

  const coupleActivityPageSource = readFileSync(
    resolve(process.cwd(), 'src/app/couple-activity/page.tsx'),
    'utf8'
  );
  assert.doesNotMatch(
    coupleActivityPageSource,
    /suggestNext|suggestionPlan|lastSuggestionSkippedReason/,
    'the primary activity UI must use the canonical recommendation panel only'
  );
  const coupleActivityViewSource = readFileSync(
    resolve(process.cwd(), 'src/features/activities/CoupleActivityView.tsx'),
    'utf8'
  );
  assert.doesNotMatch(coupleActivityViewSource, /tab === 'suggested'/);
  assert.doesNotMatch(coupleActivityViewSource, /onSetTab\('suggested'\)/);

  const recommendationRouteSource = readFileSync(
    resolve(process.cwd(), 'src/app/api/pairs/[id]/recommendations/route.ts'),
    'utf8'
  );
  const recommendationRequestSource = readFileSync(
    resolve(process.cwd(), 'src/app/api/pairs/[id]/recommendations/request.ts'),
    'utf8'
  );
  assert.match(recommendationRouteSource, /requireSession/);
  assert.match(recommendationRouteSource, /withIdempotency/);
  assert.match(recommendationRequestSource, /z\.discriminatedUnion/);

  const startRouteSource = readFileSync(
    resolve(process.cwd(), 'src/app/api/activities/[id]/start/route.ts'),
    'utf8'
  );
  assert.match(startRouteSource, /requireSession/);
  assert.match(startRouteSource, /withIdempotency/);
  assert.match(startRouteSource, /activitiesService\.startActivity/);

  console.log('Activity flow self-check passed.');
};

run();
