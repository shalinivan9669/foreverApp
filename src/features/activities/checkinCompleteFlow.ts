import type { UiErrorState } from '@/client/api/errors';
import { createIdempotencyKey } from '@/client/api/idempotency';

export type CheckinCompleteAttempt = {
  checkInKey: string;
  completeKey: string;
};

const normalizeCode = (code: string | undefined): string =>
  String(code ?? '').toUpperCase();

export const createCheckinCompleteAttempt = (): CheckinCompleteAttempt => ({
  checkInKey: createIdempotencyKey(),
  completeKey: createIdempotencyKey(),
});

export const getOrCreateCheckinCompleteAttempt = (
  existing: CheckinCompleteAttempt | null
): CheckinCompleteAttempt => existing ?? createCheckinCompleteAttempt();

export const isConflictResolvedByRefetch = (
  error: UiErrorState | null
): boolean => {
  if (!error) return false;
  return normalizeCode(error.code) === 'STATE_CONFLICT';
};

export const toCompleteRetryMessage = (error: UiErrorState | null): string => {
  if (!error) {
    return 'Could not complete the activity. Answers were saved. Click "Complete again".';
  }
  const code = normalizeCode(error.code);

  if (error.status === 401) {
    return 'Session expired. Sign in again, then click "Complete again".';
  }
  if (error.status === 403) {
    return 'Not enough permissions to complete this activity. Refresh and try again.';
  }
  if (error.status === 404) {
    return 'Activity not found. Refresh: state may have changed.';
  }
  if (code === 'IDEMPOTENCY_IN_PROGRESS') {
    return 'Previous completion request is still processing. Wait a moment, then click "Complete again".';
  }
  if (code === 'IDEMPOTENCY_KEY_REUSE_CONFLICT') {
    return 'Retry key conflict. Refresh the list and click "Complete again".';
  }
  if (error.status === 409) {
    return 'Activity state conflict. Refresh the list, then click "Complete again".';
  }
  if (error.status === 422) {
    return 'Idempotency key error. Answers were saved. Click "Complete again".';
  }
  if (error.status >= 500 || error.status === 0) {
    return 'Server is unavailable. Answers were saved. Click "Complete again".';
  }

  return `Could not complete the activity (${error.code}). Answers were saved. Click "Complete again".`;
};

export const CONFLICT_RESOLVED_MESSAGE =
  'Activity state has already changed. The list was refreshed.';
