import { connectToDatabase } from '@/lib/mongodb';
import type { StoredIdempotencyEnvelope, IdempotencyRecordView } from '@/lib/idempotency/types';
import { IdempotencyRecord, type IdempotencyRecordType } from '@/models/IdempotencyRecord';

type DuplicateKeyError = {
  code: number;
};

const isDuplicateKeyError = (error: object): error is DuplicateKeyError => {
  if (!('code' in error)) return false;
  const value = (error as { code: number }).code;
  return typeof value === 'number' && value === 11000;
};

const toView = (record: IdempotencyRecordType | null): IdempotencyRecordView | null => {
  if (!record) return null;

  return {
    key: record.key,
    route: record.route,
    userId: record.userId,
    requestHash: record.requestHash,
    state: record.state,
    status: record.status,
    responseEnvelope: record.responseEnvelope,
    createdAt: record.createdAt,
  };
};

export const findIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
}): Promise<IdempotencyRecordView | null> => {
  await connectToDatabase();

  const record = await IdempotencyRecord.findOne({
    key: params.key,
    route: params.route,
    userId: params.userId,
  }).lean<IdempotencyRecordType | null>();

  return toView(record);
};

export const createInProgressIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
}): Promise<{ kind: 'created' } | { kind: 'existing'; record: IdempotencyRecordView }> => {
  await connectToDatabase();

  try {
    await IdempotencyRecord.create({
      key: params.key,
      route: params.route,
      userId: params.userId,
      requestHash: params.requestHash,
      state: 'in_progress',
      status: 0,
    });

    return { kind: 'created' };
  } catch (error) {
    if (error instanceof Error && isDuplicateKeyError(error as object)) {
      const existing = await findIdempotencyRecord({
        key: params.key,
        route: params.route,
        userId: params.userId,
      });

      if (existing) {
        return { kind: 'existing', record: existing };
      }
    }

    throw error;
  }
};

export const completeIdempotencyRecord = async (params: {
  key: string;
  route: string;
  userId: string;
  requestHash: string;
  status: number;
  responseEnvelope: StoredIdempotencyEnvelope;
}): Promise<void> => {
  await connectToDatabase();

  await IdempotencyRecord.updateOne(
    {
      key: params.key,
      route: params.route,
      userId: params.userId,
      requestHash: params.requestHash,
    },
    {
      $set: {
        state: 'completed',
        status: params.status,
        responseEnvelope: params.responseEnvelope,
      },
    }
  );
};
