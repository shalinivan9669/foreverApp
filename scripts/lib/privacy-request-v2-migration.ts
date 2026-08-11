import mongoose, { Types } from 'mongoose';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { PrivacyRequest } from '@/models/PrivacyRequest';

export type PrivacyRequestMigrationMode = 'DRY_RUN' | 'PRIVACY_V2';

type IndexKey = Record<string, number>;

type RawPrivacyRequest = {
  _id: Types.ObjectId;
  ownerUserId?: string;
  kind?: string;
  status?: string;
  requestVersion?: string;
  policyReasonCode?: string;
  ownerSubjectHash?: string;
};

export type PrivacyRequestMigrationReport = {
  mode: PrivacyRequestMigrationMode;
  batchSize: number;
  scanned: number;
  eligible: number;
  migrated: number;
  invalidOwner: number;
  unsupportedStatus: number;
  pendingIdentityConflicts: number;
  legacyExactIndexes: number;
  unexpectedCanonicalNameConflicts: number;
  canonicalIndexMissingBefore: boolean;
  droppedLegacyExactIndexes: number;
  createdCanonicalIndexes: number;
};

type RunPrivacyRequestMigrationInput = {
  mode?: PrivacyRequestMigrationMode;
  batchSize?: number;
};

const LEGACY_INDEX_NAME = 'privacy_request_one_pending_per_owner';
const CANONICAL_INDEX_NAME = 'privacy_request_one_confirmable_per_owner_v2';
const INDEX_KEY: IndexKey = { ownerUserId: 1, kind: 1, status: 1 };
const SUPPORTED_STATUSES = new Set([
  'PENDING_POLICY_REVIEW',
  'PENDING_CONFIRMATION',
  'EXECUTING',
  'EXECUTED',
  'FAILED',
  'CANCELLED',
]);

const sameIndexKey = (actual: IndexKey, expected: IndexKey): boolean => {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([field, direction], index) =>
        expectedEntries[index]?.[0] === field &&
        expectedEntries[index]?.[1] === direction
    )
  );
};

const exactPartialStatus = (
  value: mongoose.mongo.Document | undefined,
  status: string
): boolean => {
  if (!value) return false;
  const entries = Object.entries(value);
  return entries.length === 1 && entries[0]?.[0] === 'status' && entries[0]?.[1] === status;
};

const namespaceMissing = (error: Error): boolean =>
  error instanceof mongoose.mongo.MongoServerError &&
  error.codeName === 'NamespaceNotFound';

const indexes = async (): Promise<mongoose.mongo.IndexDescriptionInfo[]> => {
  try {
    return await PrivacyRequest.collection.listIndexes().toArray();
  } catch (error) {
    if (error instanceof Error && namespaceMissing(error)) return [];
    throw error;
  }
};

const assertBatchSize = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('batchSize must be an integer between 1 and 500');
  }
  return value;
};

const requiresMigration = (row: RawPrivacyRequest): boolean =>
  row.status === 'PENDING_POLICY_REVIEW' ||
  row.requestVersion !== 'privacy-request-v2' ||
  row.policyReasonCode !== 'PRIVACY_MINIMAL_IMMEDIATE_DELETION' ||
  typeof row.ownerSubjectHash !== 'string' ||
  row.ownerSubjectHash.length !== 64;

const hasPendingIdentityConflict = async (
  row: RawPrivacyRequest,
  ownerUserId: string
): Promise<boolean> => {
  if (
    row.status !== 'PENDING_POLICY_REVIEW' &&
    row.status !== 'PENDING_CONFIRMATION'
  ) {
    return false;
  }
  const count = await PrivacyRequest.collection.countDocuments({
    _id: { $ne: row._id },
    ownerUserId,
    kind: 'ACCOUNT_DELETION',
    status: { $in: ['PENDING_POLICY_REVIEW', 'PENDING_CONFIRMATION'] },
  });
  return count > 0;
};

export async function runPrivacyRequestV2Migration(
  input: RunPrivacyRequestMigrationInput = {}
): Promise<PrivacyRequestMigrationReport> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('DATABASE_NOT_CONNECTED');
  }
  const mode = input.mode ?? 'DRY_RUN';
  const batchSize = assertBatchSize(input.batchSize ?? 100);
  const beforeIndexes = await indexes();
  const legacyExactIndexes = beforeIndexes.filter(
    (index) =>
      index.name === LEGACY_INDEX_NAME &&
      index.unique === true &&
      sameIndexKey(index.key as IndexKey, INDEX_KEY) &&
      exactPartialStatus(
        index.partialFilterExpression as mongoose.mongo.Document | undefined,
        'PENDING_POLICY_REVIEW'
      )
  );
  const unexpectedCanonicalNameConflicts = beforeIndexes.filter(
    (index) =>
      index.name === CANONICAL_INDEX_NAME &&
      !(
        index.unique === true &&
        sameIndexKey(index.key as IndexKey, INDEX_KEY) &&
        exactPartialStatus(
          index.partialFilterExpression as mongoose.mongo.Document | undefined,
          'PENDING_CONFIRMATION'
        )
      )
  );
  const canonicalPresent = beforeIndexes.some(
    (index) =>
      index.name === CANONICAL_INDEX_NAME &&
      index.unique === true &&
      sameIndexKey(index.key as IndexKey, INDEX_KEY) &&
      exactPartialStatus(
        index.partialFilterExpression as mongoose.mongo.Document | undefined,
        'PENDING_CONFIRMATION'
      )
  );

  const report: PrivacyRequestMigrationReport = {
    mode,
    batchSize,
    scanned: 0,
    eligible: 0,
    migrated: 0,
    invalidOwner: 0,
    unsupportedStatus: 0,
    pendingIdentityConflicts: 0,
    legacyExactIndexes: legacyExactIndexes.length,
    unexpectedCanonicalNameConflicts: unexpectedCanonicalNameConflicts.length,
    canonicalIndexMissingBefore: !canonicalPresent,
    droppedLegacyExactIndexes: 0,
    createdCanonicalIndexes: 0,
  };

  if (mode === 'PRIVACY_V2' && unexpectedCanonicalNameConflicts.length > 0) {
    throw new Error('Canonical privacy index name has an unexpected signature');
  }

  let afterId: Types.ObjectId | undefined;
  while (true) {
    const rows = await PrivacyRequest.collection
      .find({
        ...(afterId ? { _id: { $gt: afterId } } : {}),
        $or: [
          { status: 'PENDING_POLICY_REVIEW' },
          { requestVersion: { $ne: 'privacy-request-v2' } },
          { policyReasonCode: { $ne: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION' } },
          { ownerSubjectHash: { $not: /^[a-f\d]{64}$/ } },
        ],
      })
      .project<RawPrivacyRequest>({
        _id: 1,
        ownerUserId: 1,
        kind: 1,
        status: 1,
        requestVersion: 1,
        policyReasonCode: 1,
        ownerSubjectHash: 1,
      })
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (rows.length === 0) break;
    afterId = rows[rows.length - 1]?._id;

    for (const row of rows) {
      report.scanned += 1;
      if (!requiresMigration(row)) continue;
      const ownerUserId = row.ownerUserId?.trim();
      if (!ownerUserId || ownerUserId.length > 128) {
        report.invalidOwner += 1;
        continue;
      }
      if (
        row.kind !== 'ACCOUNT_DELETION' ||
        typeof row.status !== 'string' ||
        !SUPPORTED_STATUSES.has(row.status)
      ) {
        report.unsupportedStatus += 1;
        continue;
      }
      if (await hasPendingIdentityConflict(row, ownerUserId)) {
        report.pendingIdentityConflicts += 1;
        continue;
      }
      report.eligible += 1;
      if (mode === 'DRY_RUN') continue;

      const status =
        row.status === 'PENDING_POLICY_REVIEW'
          ? 'PENDING_CONFIRMATION'
          : row.status;
      const update = await PrivacyRequest.collection.updateOne(
        {
          _id: row._id,
          $or: [
            { status: 'PENDING_POLICY_REVIEW' },
            { requestVersion: { $ne: 'privacy-request-v2' } },
            { policyReasonCode: { $ne: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION' } },
            { ownerSubjectHash: { $not: /^[a-f\d]{64}$/ } },
          ],
        },
        {
          $set: {
            status,
            requestVersion: 'privacy-request-v2',
            policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION',
            ownerSubjectHash: privacySubjectHash(ownerUserId),
          },
        }
      );
      if (update.modifiedCount === 1) report.migrated += 1;
    }
  }

  if (mode === 'PRIVACY_V2') {
    for (const index of legacyExactIndexes) {
      if (!index.name) continue;
      await PrivacyRequest.collection.dropIndex(index.name);
      report.droppedLegacyExactIndexes += 1;
    }
    const beforeCreate = await indexes();
    await PrivacyRequest.createIndexes();
    const afterCreate = await indexes();
    report.createdCanonicalIndexes = Math.max(
      0,
      afterCreate.length - beforeCreate.length
    );
  }

  return report;
}
