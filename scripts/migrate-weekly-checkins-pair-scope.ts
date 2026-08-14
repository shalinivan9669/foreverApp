import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  ReleaseCommandFailure,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

type IndexKey = Record<string, number>;

const sameKey = (actual: IndexKey, expected: IndexKey): boolean => {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        expectedEntries[index]?.[0] === key && expectedEntries[index]?.[1] === value
    )
  );
};

const run = async (): Promise<void> => {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ReleaseCommandFailure('MONGODB_URI_REQUIRED');
  }
  const applyAdditiveIndexes = process.argv.includes('--apply-additive-indexes');
  const dropLegacyUnique = process.argv.includes('--drop-legacy-unique');
  if (dropLegacyUnique && !applyAdditiveIndexes) {
    throw new ReleaseCommandFailure('MODE_INVALID');
  }

  const database = await connectToDatabase();
  const mongoDatabase = database.connection.db;
  if (!mongoDatabase) {
    throw new ReleaseCommandFailure('DATABASE_NOT_CONNECTED');
  }
  const collectionExists = await mongoDatabase
    .listCollections({ name: 'weekly_checkins' }, { nameOnly: true })
    .hasNext();
  if (!collectionExists && !applyAdditiveIndexes) {
    writeReleaseCommandEvidence({
      counts: {
        collectionExists: 0,
        applyRequested: 0,
        dropLegacyRequested: Number(dropLegacyUnique),
      },
      reasonCounts: { COLLECTION_MISSING: 1, DRY_RUN_COMPLETE: 1 },
      indexNames: [],
    });
    return;
  }
  if (!collectionExists) {
    await mongoDatabase.createCollection('weekly_checkins');
  }
  const collection = database.connection.collection('weekly_checkins');
  const indexes = await collection.indexes();

  const pairScopedKey = { userId: 1, pairId: 1, weekKey: 1 };
  const pairWeekKey = { pairId: 1, weekKey: 1 };
  const userWeekKey = { userId: 1, weekKey: 1 };

  const duplicatePairScopedGroups = await collection
    .aggregate([
      { $match: { pairId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { userId: '$userId', pairId: '$pairId', weekKey: '$weekKey' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ])
    .toArray();
  const duplicateGroupCount = Number(duplicatePairScopedGroups[0]?.groups ?? 0);
  const legacyWithoutPairCount = await collection.countDocuments({
    $or: [{ pairId: { $exists: false } }, { pairId: null }],
  });

  const canonicalIndexNames = [
    'userId_1_pairId_1_weekKey_1',
    'pairId_1_weekKey_1',
    'userId_1_weekKey_1',
  ] as const;
  const inspectedIndexNames = canonicalIndexNames.filter((name) =>
    indexes.some((index) => index.name === name)
  );
  writeReleaseCommandEvidence({
    counts: {
      duplicatePairScopedGroups: duplicateGroupCount,
      legacyWithoutPairId: legacyWithoutPairCount,
      applyRequested: Number(applyAdditiveIndexes),
      dropLegacyRequested: Number(dropLegacyUnique),
    },
    reasonCounts: {},
    indexNames: inspectedIndexNames,
  });
  if (duplicateGroupCount > 0) {
    throw new ReleaseCommandFailure('MIGRATION_DATA_BLOCKED');
  }

  if (!applyAdditiveIndexes) {
    writeReleaseCommandEvidence({
      counts: {
        duplicatePairScopedGroups: duplicateGroupCount,
        legacyWithoutPairId: legacyWithoutPairCount,
      },
      reasonCounts: { DRY_RUN_COMPLETE: 1 },
      indexNames: inspectedIndexNames,
    });
    return;
  }

  const pairScopedIndex = indexes.find((index) =>
    sameKey(index.key as IndexKey, pairScopedKey)
  );
  if (pairScopedIndex && pairScopedIndex.unique !== true) {
    throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
  }
  if (!pairScopedIndex) {
    await collection.createIndex(pairScopedKey, {
      unique: true,
      name: 'userId_1_pairId_1_weekKey_1',
    });
  }

  const oldUniqueIndexes = indexes.filter(
    (index) => index.unique === true && sameKey(index.key as IndexKey, userWeekKey)
  );
  if (dropLegacyUnique) {
    for (const oldUniqueIndex of oldUniqueIndexes) {
      if (!oldUniqueIndex.name) {
        throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
      }
      await collection.dropIndex(oldUniqueIndex.name);
    }
    const legacyIndexesAfterDrop = (await collection.indexes()).filter(
      (index) =>
        index.unique === true && sameKey(index.key as IndexKey, userWeekKey)
    );
    if (legacyIndexesAfterDrop.length > 0) {
      throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE');
    }
  }

  let refreshedIndexes = await collection.indexes();
  const pairWeekIndex = refreshedIndexes.find((index) =>
    sameKey(index.key as IndexKey, pairWeekKey)
  );
  if (pairWeekIndex?.unique === true) {
    throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
  }
  if (!pairWeekIndex) {
    await collection.createIndex(pairWeekKey, { name: 'pairId_1_weekKey_1' });
    refreshedIndexes = await collection.indexes();
  }

  const userWeekIndex = refreshedIndexes.find((index) =>
    sameKey(index.key as IndexKey, userWeekKey)
  );
  if (!userWeekIndex) {
    await collection.createIndex(userWeekKey, { name: 'userId_1_weekKey_1' });
  }

  const finalIndexes = await collection.indexes();
  const finalLegacyUniqueIndexes = finalIndexes.filter(
    (index) =>
      index.unique === true && sameKey(index.key as IndexKey, userWeekKey)
  );
  const finalUserWeekLookup = finalIndexes.find(
    (index) =>
      index.unique !== true && sameKey(index.key as IndexKey, userWeekKey)
  );
  if (dropLegacyUnique && finalLegacyUniqueIndexes.length > 0) {
    throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE');
  }
  if (!finalUserWeekLookup && finalLegacyUniqueIndexes.length === 0) {
    throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE');
  }

  const finalIndexNames = canonicalIndexNames.filter((name) =>
    finalIndexes.some((index) => index.name === name)
  );
  writeReleaseCommandEvidence({
    counts: {
      duplicatePairScopedGroups: duplicateGroupCount,
      legacyWithoutPairId: legacyWithoutPairCount,
      legacyUniqueIndexesBefore: oldUniqueIndexes.length,
      legacyUniqueIndexesAfter: finalLegacyUniqueIndexes.length,
      pairScopedUniqueIndexReady: 1,
      pairWeekLookupReady: 1,
      userWeekLookupReady: Number(Boolean(finalUserWeekLookup)),
    },
    reasonCounts:
      finalLegacyUniqueIndexes.length > 0
        ? { LEGACY_INDEX_REVIEW_REQUIRED: 1 }
        : { INDEXES_READY: 1 },
    indexNames: finalIndexNames,
  });
};

void run()
  .finally(async () => {
    await mongoose.disconnect();
  })
  .catch((error: Error) => {
    writeReleaseCommandFailure(error);
    process.exitCode = 1;
  });
