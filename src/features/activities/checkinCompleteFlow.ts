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
    return 'Не удалось завершить активность. Ответы сохранены — нажмите «Завершить ещё раз».';
  }
  const code = normalizeCode(error.code);

  if (error.status === 401) {
    return 'Сессия истекла. Войдите снова, затем нажмите «Завершить ещё раз».';
  }
  if (error.status === 403) {
    return 'Недостаточно прав для завершения активности. Обновите экран и повторите попытку.';
  }
  if (error.status === 404) {
    return 'Активность не найдена. Обновите экран: её состояние могло измениться.';
  }
  if (code === 'IDEMPOTENCY_IN_PROGRESS') {
    return 'Предыдущий запрос ещё обрабатывается. Подождите немного и нажмите «Завершить ещё раз».';
  }
  if (code === 'IDEMPOTENCY_KEY_REUSE_CONFLICT') {
    return 'Не удалось безопасно повторить запрос. Обновите список и нажмите «Завершить ещё раз».';
  }
  if (error.status === 409) {
    return 'Состояние активности уже изменилось. Обновите список и нажмите «Завершить ещё раз».';
  }
  if (error.status === 422) {
    return 'Не удалось безопасно повторить завершение. Ответы сохранены — нажмите «Завершить ещё раз».';
  }
  if (error.status >= 500 || error.status === 0) {
    return 'Сервер временно недоступен. Ответы сохранены — нажмите «Завершить ещё раз».';
  }

  return 'Не удалось завершить активность. Ответы сохранены — нажмите «Завершить ещё раз».';
};

export const CONFLICT_RESOLVED_MESSAGE =
  'Состояние активности уже изменилось. Список обновлён.';
