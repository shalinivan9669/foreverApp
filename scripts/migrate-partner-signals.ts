import type { AnyBulkWriteOperation } from 'mongodb';
import mongoose, { Types } from 'mongoose';
import {
  ReleaseCommandFailure,
  releaseReasonCounts,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UNIQUE_INDEX_NAME = 'one_partner_signal_per_daily_checkin';
const TTL_INDEX_NAME = 'expiresAt_1';
const APPLY_CONFIRMATION = 'APPLY_PARTNER_SIGNAL_MIGRATION';
const confirmedStatuses = new Set([
  'sent',
  'read',
  'hidden_by_sender',
  'dismissed_by_receiver',
]);

type LegacyPartnerSignal = {
  _id: Types.ObjectId;
  pairId?: string | Types.ObjectId | null;
  sourceCheckInId?: string | Types.ObjectId | null;
  status?: string;
  createdAt?: Date | null;
  expiresAt?: Date | null;
};

type DuplicatePlan = {
  keeper: LegacyPartnerSignal;
  duplicates: LegacyPartnerSignal[];
};

type PartnerSignalBlockerReason =
  | 'INVALID_PAIR_ID'
  | 'INVALID_SOURCE_CHECKIN_ID'
  | 'INVALID_EXPIRY_DATE'
  | 'MISSING_EXPIRY_SOURCE_DATE'
  | 'DUPLICATE_GROUP_WITHOUT_CONFIRMED_SIGNAL'
  | 'DUPLICATE_GROUP_WITH_INVALID_DATE';

const assertSafeTestUri = (uri: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new ReleaseCommandFailure('TARGET_URI_INVALID');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (parsed.protocol !== 'mongodb:') {
    throw new ReleaseCommandFailure('TARGET_URI_INVALID');
  }
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27018') {
    throw new ReleaseCommandFailure('TARGET_GUARD_FAILED');
  }
  if (!databaseName.endsWith('_test')) {
    throw new ReleaseCommandFailure('TARGET_GUARD_FAILED');
  }
  if (parsed.searchParams.get('directConnection') !== 'true') {
    throw new ReleaseCommandFailure('TARGET_GUARD_FAILED');
  }
};

const objectIdHex = (
  value: string | Types.ObjectId | null | undefined
): string | null => {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value.trim())) {
    return null;
  }
  return new Types.ObjectId(value.trim()).toHexString();
};

const validDate = (value: Date | null | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const deterministicOrder = (
  left: LegacyPartnerSignal,
  right: LegacyPartnerSignal
): number => {
  const timeDelta =
    (validDate(left.createdAt) ? left.createdAt.getTime() : Number.MAX_SAFE_INTEGER) -
    (validDate(right.createdAt) ? right.createdAt.getTime() : Number.MAX_SAFE_INTEGER);
  if (timeDelta !== 0) return timeDelta;
  return left._id.toHexString().localeCompare(right._id.toHexString());
};

const buildDuplicatePlans = (
  rows: LegacyPartnerSignal[],
  blockers: PartnerSignalBlockerReason[]
): DuplicatePlan[] => {
  const groups = new Map<string, LegacyPartnerSignal[]>();
  for (const row of rows) {
    const key = objectIdHex(row.sourceCheckInId);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const plans: DuplicatePlan[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const confirmed = group.filter(
      (row) => confirmedStatuses.has(row.status ?? '') && validDate(row.createdAt)
    );
    if (confirmed.length === 0) {
      blockers.push('DUPLICATE_GROUP_WITHOUT_CONFIRMED_SIGNAL');
      continue;
    }
    if (group.some((row) => !validDate(row.createdAt))) {
      blockers.push('DUPLICATE_GROUP_WITH_INVALID_DATE');
      continue;
    }
    confirmed.sort(deterministicOrder);
    const keeper = confirmed[0];
    plans.push({
      keeper,
      duplicates: group.filter(
        (row) => !row._id.equals(keeper._id)
      ),
    });
  }
  return plans;
};

const main = async (): Promise<void> => {
  const mongodbUri = process.env.MONGODB_URI?.trim();
  if (!mongodbUri) {
    throw new ReleaseCommandFailure('MONGODB_URI_REQUIRED');
  }
  assertSafeTestUri(mongodbUri);
  const applyMode = process.argv.includes('--apply');
  if (
    applyMode &&
    process.env.PARTNER_SIGNAL_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
  ) {
    throw new ReleaseCommandFailure('APPLY_CONFIRMATION_REQUIRED');
  }
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    const database = mongoose.connection.db;
    if (!database) {
      throw new ReleaseCommandFailure('DATABASE_NOT_CONNECTED');
    }
    const collection = database.collection<LegacyPartnerSignal>('partner_signals');
    const collectionExists = Boolean(
      await database.listCollections({ name: 'partner_signals' }).hasNext()
    );
    const rows = collectionExists
      ? await collection
          .find({})
          .project<LegacyPartnerSignal>({
            _id: 1,
            pairId: 1,
            sourceCheckInId: 1,
            status: 1,
            createdAt: 1,
            expiresAt: 1,
          })
          .toArray()
      : [];
    const indexes = collectionExists
      ? await collection.listIndexes().toArray()
      : [];

    const blockers: PartnerSignalBlockerReason[] = [];
    let pairIdStrings = 0;
    let sourceCheckInIdStrings = 0;
    let missingExpiresAt = 0;
    let invalidPairIds = 0;
    let invalidSourceCheckInIds = 0;
    let invalidExpiryDates = 0;

    for (const row of rows) {
      const pairId = objectIdHex(row.pairId);
      const sourceCheckInId = objectIdHex(row.sourceCheckInId);
      if (!pairId) invalidPairIds += 1;
      if (!sourceCheckInId) invalidSourceCheckInIds += 1;
      if (typeof row.pairId === 'string' && pairId) pairIdStrings += 1;
      if (typeof row.sourceCheckInId === 'string' && sourceCheckInId) {
        sourceCheckInIdStrings += 1;
      }
      if (row.expiresAt === null || row.expiresAt === undefined) {
        missingExpiresAt += 1;
        if (!validDate(row.createdAt)) {
          blockers.push('MISSING_EXPIRY_SOURCE_DATE');
        }
      } else if (!validDate(row.expiresAt)) {
        invalidExpiryDates += 1;
      }
    }

    if (invalidPairIds > 0) blockers.push('INVALID_PAIR_ID');
    if (invalidSourceCheckInIds > 0) {
      blockers.push('INVALID_SOURCE_CHECKIN_ID');
    }
    if (invalidExpiryDates > 0) {
      blockers.push('INVALID_EXPIRY_DATE');
    }

    const duplicatePlans = buildDuplicatePlans(rows, blockers);
    const duplicateDocuments = duplicatePlans.reduce(
      (total, plan) => total + plan.duplicates.length,
      0
    );
    const sourceIndexes = indexes.filter(
      (index) =>
        Object.keys(index.key).length === 1 && index.key.sourceCheckInId === 1
    );
    const expiryIndexes = indexes.filter(
      (index) => Object.keys(index.key).length === 1 && index.key.expiresAt === 1
    );

    const counts = {
      scanned: rows.length,
      normalizePairIds: pairIdStrings,
      normalizeSourceCheckInIds: sourceCheckInIdStrings,
      setExpiresAt: missingExpiresAt,
      duplicateGroups: duplicatePlans.length,
      deleteDuplicateDocuments: duplicateDocuments,
      sourceIndexesBefore: sourceIndexes.length,
      canonicalSourceIndexesBefore: sourceIndexes.filter(
        (index) => index.name === UNIQUE_INDEX_NAME && index.unique === true
      ).length,
      expiryIndexesBefore: expiryIndexes.length,
      canonicalExpiryIndexesBefore: expiryIndexes.filter(
        (index) =>
          index.name === TTL_INDEX_NAME && index.expireAfterSeconds === 0
      ).length,
      invalidPairIds,
      invalidSourceCheckInIds,
      invalidExpiryDates,
    };
    const blockerCounts = blockers.reduce<Record<string, number>>(
      (result, reasonCode) => ({
        ...result,
        [reasonCode]: (result[reasonCode] ?? 0) + 1,
      }),
      {}
    );
    const inspectedIndexNames = [
      ...(sourceIndexes.some((index) => index.name === UNIQUE_INDEX_NAME)
        ? [UNIQUE_INDEX_NAME]
        : []),
      ...(expiryIndexes.some((index) => index.name === TTL_INDEX_NAME)
        ? [TTL_INDEX_NAME]
        : []),
    ];

    if (!applyMode) {
      writeReleaseCommandEvidence({
        counts,
        reasonCounts: releaseReasonCounts(blockerCounts),
        indexNames: inspectedIndexNames,
      });
      return;
    }
    if (blockers.length > 0) {
      writeReleaseCommandEvidence({
        counts,
        reasonCounts: releaseReasonCounts(blockerCounts),
        indexNames: inspectedIndexNames,
      });
      throw new ReleaseCommandFailure('MIGRATION_DATA_BLOCKED');
    }

    const duplicateIds = duplicatePlans.flatMap((plan) =>
      plan.duplicates.map((row) => row._id)
    );
    const duplicateIdSet = new Set(
      duplicateIds.map((id) => id.toHexString())
    );
    const updates: AnyBulkWriteOperation<LegacyPartnerSignal>[] = [];
    for (const row of rows) {
      if (duplicateIdSet.has(row._id.toHexString())) continue;
      const set: Partial<LegacyPartnerSignal> = {};
      if (typeof row.pairId === 'string') {
        set.pairId = new Types.ObjectId(row.pairId.trim());
      }
      if (typeof row.sourceCheckInId === 'string') {
        set.sourceCheckInId = new Types.ObjectId(row.sourceCheckInId.trim());
      }
      if (row.expiresAt === null || row.expiresAt === undefined) {
        set.expiresAt = new Date(row.createdAt!.getTime() + RETENTION_MS);
      }
      if (Object.keys(set).length > 0) {
        updates.push({
          updateOne: {
            filter: { _id: row._id },
            update: { $set: set },
          },
        });
      }
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (duplicateIds.length > 0) {
          await collection.deleteMany(
            { _id: { $in: duplicateIds } },
            { session }
          );
        }
        if (updates.length > 0) {
          await collection.bulkWrite(updates, { ordered: true, session });
        }
      });
    } finally {
      await session.endSession();
    }

    for (const index of sourceIndexes) {
      const alreadyCanonical =
        index.name === UNIQUE_INDEX_NAME && index.unique === true;
      if (!alreadyCanonical && index.name) await collection.dropIndex(index.name);
    }
    for (const index of expiryIndexes) {
      const alreadyCanonical =
        index.name === TTL_INDEX_NAME && index.expireAfterSeconds === 0;
      if (!alreadyCanonical && index.name) await collection.dropIndex(index.name);
    }
    await collection.createIndex(
      { sourceCheckInId: 1 },
      { unique: true, name: UNIQUE_INDEX_NAME }
    );
    await collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: TTL_INDEX_NAME }
    );

    writeReleaseCommandEvidence({
      counts: {
        ...counts,
        updatedDocuments: updates.length,
        deletedDocuments: duplicateIds.length,
        indexesApplied: 2,
      },
      reasonCounts: {},
      indexNames: [UNIQUE_INDEX_NAME, TTL_INDEX_NAME],
    });
  } finally {
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  writeReleaseCommandFailure(error);
  process.exitCode = 1;
});
