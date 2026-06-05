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
  const database = await connectToDatabase();
  const collection = database.connection.collection('weekly_checkins');
  const indexes = await collection.indexes();

  const pairScopedKey = { userId: 1, pairId: 1, weekKey: 1 };
  const pairWeekKey = { pairId: 1, weekKey: 1 };
  const userWeekKey = { userId: 1, weekKey: 1 };

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

  const oldUniqueIndex = indexes.find(
    (index) => index.unique === true && sameKey(index.key as IndexKey, userWeekKey)
  );
  if (oldUniqueIndex?.name) {
    await collection.dropIndex(oldUniqueIndex.name);
  }

  const refreshedIndexes = await collection.indexes();
  const pairWeekIndex = refreshedIndexes.find((index) =>
    sameKey(index.key as IndexKey, pairWeekKey)
  );
  if (pairWeekIndex?.unique === true) {
    throw new Error('Pair/week lookup index must not be unique');
  }
  if (!pairWeekIndex) {
    await collection.createIndex(pairWeekKey, { name: 'pairId_1_weekKey_1' });
  }

  const userWeekIndex = refreshedIndexes.find((index) =>
    sameKey(index.key as IndexKey, userWeekKey)
  );
  if (userWeekIndex?.unique === true) {
    throw new Error('Legacy user/week unique index is still present');
  }
  if (!userWeekIndex) {
    await collection.createIndex(userWeekKey, { name: 'userId_1_weekKey_1' });
  }

  console.log('weekly_checkins pair-scoped indexes are ready');
};

void run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
