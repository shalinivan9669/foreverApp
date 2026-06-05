import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Types } from 'mongoose';
import type { UiErrorState } from '../src/client/api/errors';
import type { PairActivityType } from '../src/models/PairActivity';
import { toPairActivityDTO } from '../src/lib/dto/activity.dto';
import { toActivityCardVM } from '../src/client/viewmodels/activity.viewmodels';
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
    why: { ru: 'Причина', en: 'Reason' },
    mode: 'together',
    sync: 'sync',
    difficulty: 1,
    intensity: 1,
    offeredAt: new Date('2026-06-05T00:00:00.000Z'),
    status: 'completed_partial',
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
  assert.equal(dto.resultSummary?.submittedCount, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(dto, 'answers'),
    false,
    'activity DTO must not expose raw answers'
  );

  const card = toActivityCardVM(dto);
  assert.equal(card.successScore, oneHigh.successScore);
  assert.equal(card.resultSummary?.submittedCount, 1);

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

  const activityCardSource = readFileSync(
    resolve(process.cwd(), 'src/components/activities/ActivityCard.tsx'),
    'utf8'
  );
  assert.match(activityCardSource, /Старая активность — результата ещё нет/);

  console.log('Activity flow self-check passed.');
};

run();
