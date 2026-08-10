import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
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
  acquireIdempotencyRecord,
  failIdempotencyRecord,
} from '@/lib/idempotency/store';
import type { StoredIdempotencyEnvelope } from '@/lib/idempotency/types';
import {
  operationalRouteGroupForPath,
  recordOperationalEvent,
  type OperationalRouteGroup,
} from '@/lib/observability/operationalEvents';

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

export const resolveDuplicateReplay = (params: {
  requestHash: string;
  routeGroup?: OperationalRouteGroup;
  existing: {
    requestHash: string;
    state: 'in_progress' | 'completed' | 'failed';
    status: number;
    responseEnvelope?: StoredIdempotencyEnvelope;
  };
}): Response => {
  if (params.existing.requestHash !== params.requestHash) {
    if (params.routeGroup) {
      recordOperationalEvent({
        name: 'conflict_observed',
        routeGroup: params.routeGroup,
        outcome: 'conflict',
        code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
      });
    }
    return jsonError(
      409,
      'IDEMPOTENCY_KEY_REUSE_CONFLICT',
      'Idempotency-Key was already used with a different request payload'
    );
  }

  if (params.existing.state !== 'completed' || !params.existing.responseEnvelope) {
    if (params.routeGroup) {
      recordOperationalEvent({
        name: 'retry_observed',
        routeGroup: params.routeGroup,
        outcome: 'retry',
        code: 'IDEMPOTENCY_IN_PROGRESS',
      });
    }
    return jsonError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is already in progress'
    );
  }

  if (params.routeGroup) {
    recordOperationalEvent({
      name: 'retry_observed',
      routeGroup: params.routeGroup,
      outcome: 'retry',
      code: 'IDEMPOTENCY_REPLAY',
    });
  }

  return toResponse(params.existing.responseEnvelope, params.existing.status);
};

type ClaimedOutcomePersistence = {
  complete: () => Promise<void>;
  fail: (failureCode: string) => Promise<boolean>;
};

export const persistClaimedIdempotencyOutcome = async (input: {
  persistence: ClaimedOutcomePersistence;
  failureCode: string;
}): Promise<boolean> => {
  try {
    await input.persistence.complete();
    return true;
  } catch {
    await input.persistence.fail(input.failureCode).catch(() => false);
    return false;
  }
};

const reconciliationPendingResponse = (): Response =>
  jsonError(
    503,
    'IDEMPOTENCY_IN_PROGRESS',
    'Request outcome is being reconciled; retry with the same Idempotency-Key'
  );

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

  const leaseOwner = randomUUID();
  const acquired = await acquireIdempotencyRecord({
    key: keyResult.key,
    route: options.route,
    userId: options.userId,
    requestHash,
    leaseOwner,
  });
  const routeGroup = operationalRouteGroupForPath(options.route);

  if (acquired.kind === 'existing') {
    return resolveDuplicateReplay({
      requestHash,
      routeGroup,
      existing: acquired.record,
    });
  }
  if (acquired.takeover) {
    recordOperationalEvent({
      name: 'retry_observed',
      routeGroup,
      outcome: 'retry',
      code: 'IDEMPOTENCY_LEASE_TAKEOVER',
    });
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
  const identity = {
    key: keyResult.key,
    route: options.route,
    userId: options.userId,
    requestHash,
    leaseOwner,
  };

  if (status >= 500) {
    await failIdempotencyRecord({
      ...identity,
      failureCode: envelope.ok ? 'INTERNAL' : envelope.error.code,
    }).catch(() => false);
    return toResponse(storedEnvelope, status);
  }

  const persisted = await persistClaimedIdempotencyOutcome({
    persistence: {
      complete: async () => {
        await completeIdempotencyRecord({
          ...identity,
          status,
          responseEnvelope: storedEnvelope,
        });
      },
      fail: (failureCode) =>
        failIdempotencyRecord({ ...identity, failureCode }),
    },
    failureCode: 'IDEMPOTENCY_COMPLETION_WRITE_FAILED',
  });
  if (!persisted) {
    recordOperationalEvent({
      name: 'retry_observed',
      routeGroup,
      outcome: 'retry',
      code: 'IDEMPOTENCY_COMPLETION_WRITE_FAILED',
    });
    return reconciliationPendingResponse();
  }

  return toResponse(storedEnvelope, status);
}
