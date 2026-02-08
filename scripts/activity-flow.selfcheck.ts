import assert from 'node:assert/strict';
import type { UiErrorState } from '../src/client/api/errors';
import {
  CONFLICT_RESOLVED_MESSAGE,
  createCheckinCompleteAttempt,
  getOrCreateCheckinCompleteAttempt,
  isConflictResolvedByRefetch,
  toCompleteRetryMessage,
} from '../src/features/activities/checkinCompleteFlow';

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

  console.log('Activity flow self-check passed.');
};

run();
