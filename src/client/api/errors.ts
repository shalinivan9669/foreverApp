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
  | 'paywall'
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

export const isPaywallCode = (code: ApiErrorCode): boolean =>
  code === 'ENTITLEMENT_REQUIRED' || code === 'QUOTA_EXCEEDED';

export const isPaywallError = (error: Error): boolean =>
  isApiClientError(error) && isPaywallCode(error.code);

const toUiErrorKind = (code: ApiErrorCode, status: number): UiErrorKind => {
  if (isPaywallCode(code)) return 'paywall';
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

export const toUiErrorState = (error: Error): UiErrorState => {
  if (!isApiClientError(error)) {
    return {
      kind: 'generic',
      code: 'INTERNAL',
      message: error.message || 'Unexpected error',
      status: 500,
    };
  }

  return {
    kind: toUiErrorKind(error.code, error.status),
    code: error.code,
    message: error.message,
    status: error.status,
    details: error.details,
    retryAfterMs: error.retryAfterMs,
  };
};
