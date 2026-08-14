import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  ReleaseCommandFailure,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

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
    .listCollections({ name: PAIRS_COLLECTION }, { nameOnly: true })
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

  const inspectedIndexNames = contextIndexes.some(
    (index) => index.name === CONTEXT_LOOKUP_NAME
  )
    ? [CONTEXT_LOOKUP_NAME]
    : [];
  writeReleaseCommandEvidence({
    counts: {
      legacyUniqueIndexes: legacyIndexes.length,
      contextLookupIndexes: contextIndexes.length,
      applyRequested: Number(applyAdditiveIndexes),
      dropLegacyRequested: Number(dropLegacyUnique),
    },
    reasonCounts: {},
    indexNames: inspectedIndexNames,
  });

  if (
    namedIndex &&
    !sameKey(namedIndex.key as IndexKey, CONTEXT_LOOKUP_KEY) &&
    !namedIndexIsDroppableLegacy
  ) {
    throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
  }
  if (contextIndexes.some((index) => index.unique === true)) {
    throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
  }

  if (!applyAdditiveIndexes) {
    writeReleaseCommandEvidence({
      counts: {
        legacyUniqueIndexes: legacyIndexes.length,
        contextLookupIndexes: contextIndexes.length,
      },
      reasonCounts: {
        DRY_RUN_COMPLETE: 1,
        ...(legacyIndexes.length > 0
          ? { LEGACY_INDEX_REVIEW_REQUIRED: 1 }
          : {}),
      },
      indexNames: inspectedIndexNames,
    });
    return;
  }

  if (namedIndexIsDroppableLegacy) {
    if (!dropLegacyUnique || !namedIndex?.name) {
      throw new ReleaseCommandFailure('LEGACY_INDEX_REVIEW_REQUIRED');
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
  if (dropLegacyUnique) {
    for (const legacyIndex of legacyIndexesAfterCreate) {
      if (!legacyIndex.name) {
        throw new ReleaseCommandFailure('INDEX_SHAPE_BLOCKED');
      }
      await collection.dropIndex(legacyIndex.name);
    }
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
    throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE');
  }
  if (dropLegacyUnique && finalLegacyIndexes.length > 0) {
    throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE');
  }

  const finalIndexNames = finalContextIndex ? [CONTEXT_LOOKUP_NAME] : [];
  writeReleaseCommandEvidence({
    counts: {
      legacyUniqueIndexesBefore: legacyIndexes.length,
      legacyUniqueIndexesAfter: finalLegacyIndexes.length,
      contextLookupIndexesAfter: Number(Boolean(finalContextIndex)),
    },
    reasonCounts:
      finalLegacyIndexes.length > 0
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
