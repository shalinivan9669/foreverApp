import type { ApiJsonObject, ApiJsonValue } from './types';

export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_SESSION'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'STATE_CONFLICT'
  | 'ENTITLEMENT_REQUIRED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'IDEMPOTENCY_KEY_REUSE_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'INTERNAL'
  | 'NETWORK_ERROR'
  | 'INVALID_ENVELOPE'
  | (string & {});

export type UiErrorKind =
  | 'rate_limited'
  | 'auth_required'
  | 'not_found'
  | 'access_denied'
  | 'state_conflict'
  | 'validation'
  | 'generic';

export type UiErrorState = {
  kind: UiErrorKind;
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: ApiJsonValue;
  retryAfterMs?: number;
};

export type ApiClientErrorInput = {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: ApiJsonValue;
  retryAfterMs?: number;
};

const isObject = (value: ApiJsonValue | undefined): value is ApiJsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRetryAfterMsFromDetails = (details?: ApiJsonValue): number | undefined => {
  if (!isObject(details)) return undefined;
  const retryAfter = details.retryAfterMs;
  if (typeof retryAfter !== 'number' || Number.isNaN(retryAfter)) return undefined;
  return Math.max(0, retryAfter);
};

const readRetryAfterMsFromHeader = (headerValue: string | null): number | undefined => {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds)) return undefined;
  return Math.max(0, Math.round(seconds * 1000));
};

export const readRetryAfterMs = (
  details?: ApiJsonValue,
  retryAfterHeader?: string | null
): number | undefined => {
  return readRetryAfterMsFromDetails(details) ?? readRetryAfterMsFromHeader(retryAfterHeader ?? null);
};

export class ApiClientError extends Error {
  readonly status: number;

  readonly code: ApiErrorCode;

  readonly details?: ApiJsonValue;

  readonly retryAfterMs?: number;

  constructor(input: ApiClientErrorInput) {
    super(input.message);
    this.name = 'ApiClientError';
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export const isApiClientError = (error: Error): error is ApiClientError => {
  return error instanceof ApiClientError;
};

export const hasApiErrorCode = (error: Error, code: ApiErrorCode): boolean => {
  return isApiClientError(error) && error.code === code;
};

const toUiErrorKind = (code: ApiErrorCode, status: number): UiErrorKind => {
  if (code === 'ENTITLEMENT_REQUIRED' || code === 'QUOTA_EXCEEDED') {
    return 'generic';
  }
  if (code === 'RATE_LIMITED') return 'rate_limited';
  if (code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID_SESSION') return 'auth_required';
  if (code === 'IDEMPOTENCY_KEY_REQUIRED' || code === 'IDEMPOTENCY_KEY_INVALID') {
    return 'validation';
  }
  if (code === 'NOT_FOUND') return 'not_found';
  if (code === 'ACCESS_DENIED') return 'access_denied';
  if (
    code === 'STATE_CONFLICT' ||
    code === 'IDEMPOTENCY_IN_PROGRESS' ||
    code === 'IDEMPOTENCY_KEY_REUSE_CONFLICT'
  ) {
    return 'state_conflict';
  }
  if (code === 'VALIDATION_ERROR') return 'validation';
  if (status === 401) return 'auth_required';
  if (status === 403) return 'access_denied';
  if (status === 404) return 'not_found';
  if (status === 409) return 'state_conflict';
  if (status === 422) return 'validation';
  return 'generic';
};

const fallbackMessageForKind = (kind: UiErrorKind): string => {
  if (kind === 'auth_required') {
    return 'Сессия не найдена или истекла. Откройте приложение из Discord и войдите снова.';
  }
  if (kind === 'access_denied') return 'У вас нет доступа к этому действию.';
  if (kind === 'not_found') return 'Запрошенные данные не найдены. Обновите экран и попробуйте снова.';
  if (kind === 'state_conflict') {
    return 'Состояние уже изменилось. Обновите данные и попробуйте снова.';
  }
  if (kind === 'validation') return 'Проверьте введённые данные и попробуйте снова.';
  if (kind === 'rate_limited') {
    return 'Слишком много запросов. Подождите немного и попробуйте снова.';
  }
  return 'Не удалось выполнить запрос. Проверьте соединение и попробуйте снова.';
};

const userFacingMessage = (error: ApiClientError, kind: UiErrorKind): string => {
  const message = error.message.trim();
  return /[А-Яа-яЁё]/.test(message) ? message : fallbackMessageForKind(kind);
};

export const toUiErrorState = (error: Error): UiErrorState => {
  if (!isApiClientError(error)) {
    return {
      kind: 'generic',
      code: 'INTERNAL',
      message: 'Внутренняя ошибка. Попробуйте ещё раз.',
      status: 500,
    };
  }

  if (error.status >= 500 || error.code === 'INTERNAL') {
    return {
      kind: 'generic',
      code: 'INTERNAL',
      message: 'Внутренняя ошибка. Попробуйте ещё раз.',
      status: error.status,
    };
  }

  const kind = toUiErrorKind(error.code, error.status);
  return {
    kind,
    code: error.code,
    message: userFacingMessage(error, kind),
    status: error.status,
    details: error.details,
    retryAfterMs: error.retryAfterMs,
  };
};
