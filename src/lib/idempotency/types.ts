import type { ApiErrorEnvelope, ApiSuccessEnvelope, JsonValue } from '@/lib/api/response';

export type IdempotencyRecordState = 'in_progress' | 'completed';

export type StoredIdempotencyEnvelope =
  | ApiSuccessEnvelope<JsonValue>
  | ApiErrorEnvelope;

export type IdempotencyRecordView = {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  state: IdempotencyRecordState;
  status: number;
  responseEnvelope?: StoredIdempotencyEnvelope;
  createdAt: Date;
};

export type IdempotencyRequestFingerprint = {
  method: string;
  route: string;
  body: JsonValue;
};

export type IdempotencyKeyValidationResult =
  | { ok: true; key: string }
  | {
      ok: false;
      status: 422;
      code: 'IDEMPOTENCY_KEY_REQUIRED' | 'IDEMPOTENCY_KEY_INVALID';
      message: string;
    };