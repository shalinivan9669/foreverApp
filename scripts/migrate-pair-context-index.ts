import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';

type IndexKey = Record<string, number>;

const PAIRS_COLLECTION = 'pairs';
const LEGACY_UNIQUE_KEY: IndexKey = { key: 1 };
const CONTEXT_LOOKUP_KEY: IndexKey = { key: 1, createdAt: -1 };
const CONTEXT_LOOKUP_NAME = 'pair_contexts_by_member_key';

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
    .listCollections({ name: PAIRS_COLLECTION }, { nameOnly: true })
    .hasNext();
  if (!collectionExists && !applyAdditiveIndexes) {
    console.log('pairs dry run complete; collection does not exist');
    return;
  }
  if (!collectionExists) {
    await mongoDatabase.createCollection(PAIRS_COLLECTION);
  }

  const collection = database.connection.collection(PAIRS_COLLECTION);
  let indexes = await collection.indexes();
  const legacyIndexes = indexes.filter(
    (index) =>
      index.unique === true && sameKey(index.key as IndexKey, LEGACY_UNIQUE_KEY)
  );
  const contextIndexes = indexes.filter((index) =>
    sameKey(index.key as IndexKey, CONTEXT_LOOKUP_KEY)
  );
  const namedIndex = indexes.find((index) => index.name === CONTEXT_LOOKUP_NAME);
  const namedIndexIsDroppableLegacy = Boolean(
    namedIndex?.unique === true &&
      sameKey(namedIndex.key as IndexKey, LEGACY_UNIQUE_KEY)
  );

  console.log(
    `pairs preflight: legacyUnique=${legacyIndexes.length} contextLookup=${contextIndexes.length} apply=${applyAdditiveIndexes} dropLegacy=${dropLegacyUnique}`
  );

  if (
    namedIndex &&
    !sameKey(namedIndex.key as IndexKey, CONTEXT_LOOKUP_KEY) &&
    !namedIndexIsDroppableLegacy
  ) {
    throw new Error(
      `${CONTEXT_LOOKUP_NAME} exists with an unexpected key; review it manually before migration`
    );
  }
  if (contextIndexes.some((index) => index.unique === true)) {
    throw new Error('Pair-context lookup index exists but is unique');
  }

  if (!applyAdditiveIndexes) {
    const outcome =
      legacyIndexes.length > 0
        ? 'legacy unique index detected; apply remains blocked until explicit drop review'
        : 'no legacy unique index detected';
    console.log(`pairs dry run complete; ${outcome}`);
    return;
  }

  if (namedIndexIsDroppableLegacy) {
    if (!dropLegacyUnique || !namedIndex?.name) {
      throw new Error(
        `${CONTEXT_LOOKUP_NAME} is occupied by the legacy unique key; explicit legacy drop is required`
      );
    }
    await collection.dropIndex(namedIndex.name);
    indexes = await collection.indexes();
  }

  const contextIndexAfterNameRelease = indexes.find((index) =>
    sameKey(index.key as IndexKey, CONTEXT_LOOKUP_KEY)
  );
  if (!contextIndexAfterNameRelease) {
    await collection.createIndex(CONTEXT_LOOKUP_KEY, {
      name: CONTEXT_LOOKUP_NAME,
    });
  }

  indexes = await collection.indexes();
  const legacyIndexesAfterCreate = indexes.filter(
    (index) =>
      index.unique === true && sameKey(index.key as IndexKey, LEGACY_UNIQUE_KEY)
  );
  const legacyUniqueWasPresent =
    legacyIndexes.length > 0 || legacyIndexesAfterCreate.length > 0;

  if (dropLegacyUnique) {
    for (const legacyIndex of legacyIndexesAfterCreate) {
      if (!legacyIndex.name) {
        throw new Error('Legacy Pair key unique index has no droppable name');
      }
      await collection.dropIndex(legacyIndex.name);
    }
  } else if (legacyUniqueWasPresent) {
    console.log(
      'pairs legacy unique index retained; use --drop-legacy-unique only after rollback review'
    );
  }

  const finalIndexes = await collection.indexes();
  const finalLegacyIndexes = finalIndexes.filter(
    (index) =>
      index.unique === true && sameKey(index.key as IndexKey, LEGACY_UNIQUE_KEY)
  );
  const finalContextIndex = finalIndexes.find(
    (index) =>
      index.name === CONTEXT_LOOKUP_NAME &&
      index.unique !== true &&
      sameKey(index.key as IndexKey, CONTEXT_LOOKUP_KEY)
  );

  if (!finalContextIndex) {
    throw new Error('Named non-unique pair-context lookup index was not created');
  }
  if (dropLegacyUnique && finalLegacyIndexes.length > 0) {
    throw new Error('Legacy Pair key unique index removal did not complete');
  }

  const outcome =
    finalLegacyIndexes.length > 0
      ? 'legacy unique index retained; reconnect release preflight remains blocked'
      : legacyUniqueWasPresent
        ? 'legacy unique index removed; reconnect index is ready'
        : 'no legacy unique index was present; reconnect index is ready';
  console.log(`pairs pair-context index staging complete; ${outcome}`);
};

void run()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
