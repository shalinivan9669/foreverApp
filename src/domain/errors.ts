import type { ApiErrorEnvelope, JsonValue } from '@/lib/api/response';

export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_SESSION'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSE_CONFLICT'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'INTERNAL';

export class DomainError extends Error {
  readonly code: DomainErrorCode | string;
  readonly status: number;
  readonly details?: JsonValue;

  constructor(params: {
    code: DomainErrorCode | string;
    status: number;
    message: string;
    details?: JsonValue;
  }) {
    super(params.message);
    this.name = 'DomainError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }

  toApiErrorEnvelope(): ApiErrorEnvelope {
    if (this.details !== undefined) {
      return {
        ok: false,
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export const isDomainError = (error: Error | DomainError): error is DomainError =>
  error instanceof DomainError;

export const toDomainError = (error: Error | DomainError): DomainError => {
  if (isDomainError(error)) {
    return error;
  }

  return new DomainError({
    code: 'INTERNAL',
    status: 500,
    message: error.message || 'internal',
  });
};

export const asError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error('Unknown error');
};