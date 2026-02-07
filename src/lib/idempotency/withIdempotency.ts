import type { NextRequest } from 'next/server';
import {
  jsonError,
  jsonOk,
  type ApiErrorEnvelope,
  type ApiSuccessEnvelope,
  type JsonValue,
} from '@/lib/api/response';
import { asError, DomainError, toDomainError } from '@/domain/errors';
import {
  normalizeRequestBody,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from '@/lib/idempotency/key';
import {
  completeIdempotencyRecord,
  createInProgressIdempotencyRecord,
  findIdempotencyRecord,
} from '@/lib/idempotency/store';
import type { StoredIdempotencyEnvelope } from '@/lib/idempotency/types';

export type WithIdempotencyOptions<T> = {
  req: Request | NextRequest;
  route: string;
  userId: string;
  requestBody: JsonValue;
  execute: () => Promise<T>;
};

const toStoredEnvelope = <T>(
  envelope: ApiSuccessEnvelope<T> | ApiErrorEnvelope
): StoredIdempotencyEnvelope =>
  JSON.parse(JSON.stringify(envelope)) as StoredIdempotencyEnvelope;

const toResponse = (envelope: StoredIdempotencyEnvelope, status: number): Response => {
  if (envelope.ok) {
    return jsonOk(envelope.data, envelope.meta);
  }

  return jsonError(
    status,
    envelope.error.code,
    envelope.error.message,
    envelope.error.details
  );
};

const resolveDuplicateReplay = (params: {
  requestHash: string;
  existing: {
    requestHash: string;
    state: 'in_progress' | 'completed';
    status: number;
    responseEnvelope?: StoredIdempotencyEnvelope;
  };
}): Response => {
  if (params.existing.requestHash !== params.requestHash) {
    return jsonError(
      409,
      'IDEMPOTENCY_KEY_REUSE_CONFLICT',
      'Idempotency-Key was already used with a different request payload'
    );
  }

  if (params.existing.state !== 'completed' || !params.existing.responseEnvelope) {
    return jsonError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is already in progress'
    );
  }

  return toResponse(params.existing.responseEnvelope, params.existing.status);
};

export async function withIdempotency<T>(
  options: WithIdempotencyOptions<T>
): Promise<Response> {
  const keyResult = readIdempotencyKey(options.req);
  if (!keyResult.ok) {
    return jsonError(keyResult.status, keyResult.code, keyResult.message);
  }

  const normalizedBody = normalizeRequestBody(options.requestBody);
  const requestHash = hashIdempotencyRequest({
    method: options.req.method,
    route: options.route,
    body: normalizedBody,
  });

  const existing = await findIdempotencyRecord({
    key: keyResult.key,
    route: options.route,
    userId: options.userId,
  });

  if (existing) {
    return resolveDuplicateReplay({ requestHash, existing });
  }

  const created = await createInProgressIdempotencyRecord({
    key: keyResult.key,
    route: options.route,
    userId: options.userId,
    requestHash,
  });

  if (created.kind === 'existing') {
    return resolveDuplicateReplay({ requestHash, existing: created.record });
  }

  let status = 200;
  let envelope: ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  try {
    const data = await options.execute();
    envelope = { ok: true, data };
  } catch (error: unknown) {
    const domainError = error instanceof DomainError ? error : toDomainError(asError(error));
    status = domainError.status;
    envelope = domainError.toApiErrorEnvelope();
  }

  const storedEnvelope = toStoredEnvelope(envelope);
  await completeIdempotencyRecord({
    key: keyResult.key,
    route: options.route,
    userId: options.userId,
    requestHash,
    status,
    responseEnvelope: storedEnvelope,
  });

  return toResponse(storedEnvelope, status);
}