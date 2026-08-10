import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';

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
  const applyAdditiveIndexes = process.argv.includes('--apply-additive-indexes');
  const dropLegacyUnique = process.argv.includes('--drop-legacy-unique');
  if (dropLegacyUnique && !applyAdditiveIndexes) {
    throw new Error(
      '--drop-legacy-unique requires --apply-additive-indexes; no indexes were changed'
    );
  }

  const database = await connectToDatabase();
  const mongoDatabase = database.connection.db;
  if (!mongoDatabase) throw new Error('MongoDB connection is unavailable');
  const collectionExists = await mongoDatabase
    .listCollections({ name: 'weekly_checkins' }, { nameOnly: true })
    .hasNext();
  if (!collectionExists && !applyAdditiveIndexes) {
    console.log('weekly_checkins dry run complete; collection does not exist');
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

  console.log(
    `weekly_checkins preflight: duplicatePairScopedGroups=${duplicateGroupCount} legacyWithoutPairId=${legacyWithoutPairCount}`
  );
  if (duplicateGroupCount > 0) {
    throw new Error('Pair-scoped duplicate weekly check-ins must be resolved before indexing');
  }

  if (!applyAdditiveIndexes) {
    console.log(
      'weekly_checkins dry run complete; use --apply-additive-indexes after review'
    );
    return;
  }

  const pairScopedIndex = indexes.find((index) =>
    sameKey(index.key as IndexKey, pairScopedKey)
  );
  if (pairScopedIndex && pairScopedIndex.unique !== true) {
    throw new Error('Pair-scoped weekly check-in index exists but is not unique');
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
  const legacyUniqueWasPresent = oldUniqueIndexes.length > 0;
  if (dropLegacyUnique) {
    for (const oldUniqueIndex of oldUniqueIndexes) {
      if (!oldUniqueIndex.name) {
        throw new Error('Legacy user/week unique index has no droppable name');
      }
      await collection.dropIndex(oldUniqueIndex.name);
    }
    const legacyIndexesAfterDrop = (await collection.indexes()).filter(
      (index) =>
        index.unique === true && sameKey(index.key as IndexKey, userWeekKey)
    );
    if (legacyIndexesAfterDrop.length > 0) {
      throw new Error('Legacy user/week unique index removal did not complete');
    }
  } else if (legacyUniqueWasPresent) {
    console.log(
      'weekly_checkins legacy unique index retained; use --drop-legacy-unique only after rollback review'
    );
  }

  let refreshedIndexes = await collection.indexes();
  const pairWeekIndex = refreshedIndexes.find((index) =>
    sameKey(index.key as IndexKey, pairWeekKey)
  );
  if (pairWeekIndex?.unique === true) {
    throw new Error('Pair/week lookup index must not be unique');
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
    throw new Error('Legacy user/week unique index removal did not complete');
  }
  if (!finalUserWeekLookup && finalLegacyUniqueIndexes.length === 0) {
    throw new Error('Non-unique user/week lookup index was not created');
  }

  const legacyIndexOutcome = finalLegacyUniqueIndexes.length > 0
    ? 'legacy unique index retained; release preflight remains blocked'
    : legacyUniqueWasPresent
      ? 'legacy unique index removed; non-unique user/week lookup is ready'
      : 'no legacy unique index was present; non-unique user/week lookup is ready';
  console.log(
    `weekly_checkins pair-scoped index staging complete; ${legacyIndexOutcome}`
  );
};

void run()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
