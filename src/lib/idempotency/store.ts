import { connectToDatabase } from '@/lib/mongodb';
import type {
  StoredIdempotencyEnvelope,
  IdempotencyRecordView,
} from '@/lib/idempotency/types';
import {
  IdempotencyRecord,
  type IdempotencyRecordType,
} from '@/models/IdempotencyRecord';

type DuplicateKeyError = {
  code: number;
};

export const IDEMPOTENCY_LEASE_MS = 30_000;
const LEGACY_IN_PROGRESS_GRACE_MS = IDEMPOTENCY_LEASE_MS;

const isDuplicateKeyError = (error: object): error is DuplicateKeyError => {
  if (!('code' in error)) return false;
  const value = (error as { code: number }).code;
  return typeof value === 'number' && value === 11000;
};

const toView = (
  record: IdempotencyRecordType | null
): IdempotencyRecordView | null => {
  if (!record) return null;

  return {
    key: record.key,
    route: record.route,
    userId: record.userId,
    requestHash: record.requestHash,
    state: record.state,
    status: record.status,
    responseEnvelope: record.responseEnvelope,
    leaseOwner: record.leaseOwner,
    leaseExpiresAt: record.leaseExpiresAt,
    attemptCount: record.attemptCount ?? 1,
    lastFailureCode: record.lastFailureCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

const identityFilter = (params: {
  key: string;
  route: string;
  userId: string;
}) => ({
  key: params.key,
  route: params.route,
  userId: params.userId,
});

export const findIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
}): Promise<IdempotencyRecordView | null> => {
  await connectToDatabase();

  const record = await IdempotencyRecord.findOne(identityFilter(params)).lean<
    IdempotencyRecordType | null
  >();

  return toView(record);
};

export const canTakeOverIdempotencyRecord = (input: {
  record: Pick<
    IdempotencyRecordView,
    'state' | 'leaseExpiresAt' | 'updatedAt' | 'createdAt'
  >;
  now: Date;
}): boolean => {
  if (input.record.state === 'failed') return true;
  if (input.record.state !== 'in_progress') return false;
  if (input.record.leaseExpiresAt) {
    return input.record.leaseExpiresAt.getTime() <= input.now.getTime();
  }

  const lastTouchedAt = input.record.updatedAt ?? input.record.createdAt;
  return (
    lastTouchedAt.getTime() <=
    input.now.getTime() - LEGACY_IN_PROGRESS_GRACE_MS
  );
};

type AcquireIdempotencyRecordResult =
  | { kind: 'acquired'; record: IdempotencyRecordView; takeover: boolean }
  | { kind: 'existing'; record: IdempotencyRecordView };

const tryTakeover = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  leaseOwner: string;
  now: Date;
  leaseMs: number;
}): Promise<IdempotencyRecordView | null> => {
  const legacyStaleBefore = new Date(
    params.now.getTime() - LEGACY_IN_PROGRESS_GRACE_MS
  );
  const leaseExpiresAt = new Date(params.now.getTime() + params.leaseMs);
  const record = await IdempotencyRecord.findOneAndUpdate(
    {
      ...identityFilter(params),
      requestHash: params.requestHash,
      state: { $in: ['in_progress', 'failed'] },
      $or: [
        { state: 'failed' },
        { leaseExpiresAt: { $lte: params.now } },
        {
          leaseExpiresAt: { $exists: false },
          $or: [
            { updatedAt: { $lte: legacyStaleBefore } },
            {
              updatedAt: { $exists: false },
              createdAt: { $lte: legacyStaleBefore },
            },
          ],
        },
      ],
    },
    {
      $set: {
        state: 'in_progress',
        status: 0,
        leaseOwner: params.leaseOwner,
        leaseExpiresAt,
      },
      $unset: {
        responseEnvelope: 1,
        lastFailureCode: 1,
        failedAt: 1,
        completedAt: 1,
      },
      $inc: { attemptCount: 1 },
    },
    { new: true }
  ).lean<IdempotencyRecordType | null>();

  return toView(record);
};

export const acquireIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  leaseOwner: string;
  now?: Date;
  leaseMs?: number;
}): Promise<AcquireIdempotencyRecordResult> => {
  await connectToDatabase();
  const now = params.now ?? new Date();
  const leaseMs = params.leaseMs ?? IDEMPOTENCY_LEASE_MS;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  try {
    const created = await IdempotencyRecord.create({
      key: params.key,
      route: params.route,
      userId: params.userId,
      requestHash: params.requestHash,
      state: 'in_progress',
      status: 0,
      leaseOwner: params.leaseOwner,
      leaseExpiresAt,
      attemptCount: 1,
    });
    const record = toView(created.toObject<IdempotencyRecordType>());
    if (!record) throw new Error('Idempotency record was not created');
    return { kind: 'acquired', record, takeover: false };
  } catch (error) {
    if (!(error instanceof Error) || !isDuplicateKeyError(error as object)) {
      throw error;
    }
  }

  const takeover = await tryTakeover({ ...params, now, leaseMs });
  if (takeover) {
    return { kind: 'acquired', record: takeover, takeover: true };
  }

  const existing = await findIdempotencyRecord(params);
  if (existing) return { kind: 'existing', record: existing };

  // A TTL deletion can race the duplicate-key read. Retry creation once.
  try {
    const created = await IdempotencyRecord.create({
      key: params.key,
      route: params.route,
      userId: params.userId,
      requestHash: params.requestHash,
      state: 'in_progress',
      status: 0,
      leaseOwner: params.leaseOwner,
      leaseExpiresAt,
      attemptCount: 1,
    });
    const record = toView(created.toObject<IdempotencyRecordType>());
    if (!record) throw new Error('Idempotency record was not recreated');
    return { kind: 'acquired', record, takeover: false };
  } catch (error) {
    if (!(error instanceof Error) || !isDuplicateKeyError(error as object)) {
      throw error;
    }
    const raced = await findIdempotencyRecord(params);
    if (raced) return { kind: 'existing', record: raced };
    throw error;
  }
};

export const completeIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  leaseOwner: string;
  status: number;
  responseEnvelope: StoredIdempotencyEnvelope;
  now?: Date;
}): Promise<IdempotencyRecordView> => {
  await connectToDatabase();
  const completedAt = params.now ?? new Date();

  const updated = await IdempotencyRecord.findOneAndUpdate(
    {
      ...identityFilter(params),
      requestHash: params.requestHash,
      state: 'in_progress',
      leaseOwner: params.leaseOwner,
    },
    {
      $set: {
        state: 'completed',
        status: params.status,
        responseEnvelope: params.responseEnvelope,
        completedAt,
      },
      $unset: {
        leaseOwner: 1,
        leaseExpiresAt: 1,
        lastFailureCode: 1,
        failedAt: 1,
      },
    },
    { new: true }
  ).lean<IdempotencyRecordType | null>();
  const completed = toView(updated);
  if (completed) return completed;

  const existing = await findIdempotencyRecord(params);
  if (
    existing?.state === 'completed' &&
    existing.requestHash === params.requestHash &&
    existing.status === params.status &&
    existing.responseEnvelope &&
    JSON.stringify(existing.responseEnvelope) ===
      JSON.stringify(params.responseEnvelope)
  ) {
    return existing;
  }

  throw new Error('Idempotency completion lease was lost');
};

export const failIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  leaseOwner: string;
  failureCode: string;
  now?: Date;
}): Promise<boolean> => {
  await connectToDatabase();
  const failedAt = params.now ?? new Date();
  const updated = await IdempotencyRecord.updateOne(
    {
      ...identityFilter(params),
      requestHash: params.requestHash,
      state: 'in_progress',
      leaseOwner: params.leaseOwner,
    },
    {
      $set: {
        state: 'failed',
        status: 0,
        lastFailureCode: params.failureCode.slice(0, 100),
        failedAt,
        leaseExpiresAt: failedAt,
      },
      $unset: {
        leaseOwner: 1,
        responseEnvelope: 1,
        completedAt: 1,
      },
    }
  );
  return updated.modifiedCount === 1;
};
