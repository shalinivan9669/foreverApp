import { createHash } from 'crypto';
import type { JsonValue } from '@/lib/api/response';
import type { IdempotencyKeyValidationResult, IdempotencyRequestFingerprint } from '@/lib/idempotency/types';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stableStringify = (value: JsonValue): string => {
  if (value === null) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const readIdempotencyKey = (
  request: Request | { headers: Headers }
): IdempotencyKeyValidationResult => {
  const key = request.headers.get(IDEMPOTENCY_HEADER);

  if (!key || key.trim().length === 0) {
    return {
      ok: false,
      status: 422,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required',
    };
  }

  const normalized = key.trim();
  if (!UUID_REGEX.test(normalized)) {
    return {
      ok: false,
      status: 422,
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'Idempotency-Key must be a valid UUID',
    };
  }

  return { ok: true, key: normalized };
};

export const hashIdempotencyRequest = (
  fingerprint: IdempotencyRequestFingerprint
): string => {
  const payload = `${fingerprint.method.toUpperCase()}|${fingerprint.route}|${stableStringify(
    fingerprint.body
  )}`;

  return createHash('sha256').update(payload).digest('hex');
};

export const normalizeRequestBody = (value: JsonValue): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;