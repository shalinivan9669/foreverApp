import mongoose from 'mongoose';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';

export const PAIR_QUESTIONNAIRE_INTEGRITY_VERSION =
  'pair-questionnaire-integrity-v1';
export const ACTIVE_SESSION_INDEX_NAME =
  'one_in_progress_pair_questionnaire_session';
export const ANSWER_IDENTITY_INDEX_NAME =
  'one_pair_questionnaire_answer_per_member';

const ACTIVE_SESSION_INDEX_KEY = { pairId: 1, questionnaireId: 1 } as const;
const ANSWER_IDENTITY_INDEX_KEY = {
  sessionId: 1,
  questionId: 1,
  by: 1,
} as const;

type DuplicateGroupCount = { groups: number };

export type PairQuestionnaireIntegrityReport = {
  migrationVersion: typeof PAIR_QUESTIONNAIRE_INTEGRITY_VERSION;
  duplicateActiveSessionGroups: number;
  duplicateAnswerGroups: number;
  missingCanonicalIndexes: string[];
  conflictingCanonicalIndexes: string[];
};

export const PAIR_QUESTIONNAIRE_INTEGRITY_FAILURE_CODES = [
  'MONGODB_URI_REQUIRED',
  'DUPLICATE_SOURCE_ROWS',
  'CONFLICTING_CANONICAL_INDEX',
  'MISSING_CANONICAL_INDEX',
  'INDEX_APPLY_INCOMPLETE',
  'MONGO_COMMAND_FAILED',
] as const;

export type PairQuestionnaireIntegrityFailureCode =
  (typeof PAIR_QUESTIONNAIRE_INTEGRITY_FAILURE_CODES)[number];

const FAILURE_MESSAGES: Record<
  PairQuestionnaireIntegrityFailureCode,
  string
> = {
  MONGODB_URI_REQUIRED: 'MongoDB target is not configured',
  DUPLICATE_SOURCE_ROWS: 'Questionnaire integrity duplicate groups found',
  CONFLICTING_CANONICAL_INDEX:
    'Questionnaire integrity canonical index conflict found',
  MISSING_CANONICAL_INDEX:
    'Questionnaire integrity canonical indexes are missing',
  INDEX_APPLY_INCOMPLETE:
    'Questionnaire integrity canonical index application is incomplete',
  MONGO_COMMAND_FAILED: 'Questionnaire integrity MongoDB command failed',
};

export class PairQuestionnaireIntegrityFailure extends Error {
  readonly reasonCode: PairQuestionnaireIntegrityFailureCode;

  constructor(reasonCode: PairQuestionnaireIntegrityFailureCode) {
    super(FAILURE_MESSAGES[reasonCode]);
    this.name = 'PairQuestionnaireIntegrityFailure';
    this.reasonCode = reasonCode;
  }
}

export type PairQuestionnaireIntegrityFailureReport = {
  migrationVersion: typeof PAIR_QUESTIONNAIRE_INTEGRITY_VERSION;
  ok: false;
  reasonCode: PairQuestionnaireIntegrityFailureCode;
};

export const formatPairQuestionnaireIntegrityFailure = (
  error: Error
): PairQuestionnaireIntegrityFailureReport => ({
  migrationVersion: PAIR_QUESTIONNAIRE_INTEGRITY_VERSION,
  ok: false,
  reasonCode:
    error instanceof PairQuestionnaireIntegrityFailure
      ? error.reasonCode
      : 'MONGO_COMMAND_FAILED',
});

const sameIndexKey = (
  actual: mongoose.mongo.IndexDescriptionInfo['key'],
  expected: Readonly<Record<string, number>>
): boolean => {
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

const hasOnlyInProgressPartialFilter = (
  partialFilterExpression: mongoose.mongo.Document | undefined
): boolean =>
  Boolean(
    partialFilterExpression &&
      Object.keys(partialFilterExpression).length === 1 &&
      partialFilterExpression.status === 'in_progress'
  );

const readIndexes = async (
  collection: mongoose.mongo.Collection
): Promise<mongoose.mongo.IndexDescriptionInfo[]> => {
  try {
    return await collection.indexes();
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.codeName === 'NamespaceNotFound'
    ) {
      return [];
    }
    throw error;
  }
};

const activeSessionIndexIsCanonical = (
  index: mongoose.mongo.IndexDescriptionInfo
): boolean =>
  index.name === ACTIVE_SESSION_INDEX_NAME &&
  index.unique === true &&
  sameIndexKey(index.key, ACTIVE_SESSION_INDEX_KEY) &&
  hasOnlyInProgressPartialFilter(index.partialFilterExpression) &&
  index.sparse !== true &&
  index.collation === undefined;

const answerIdentityIndexIsCanonical = (
  index: mongoose.mongo.IndexDescriptionInfo
): boolean =>
  index.name === ANSWER_IDENTITY_INDEX_NAME &&
  index.unique === true &&
  sameIndexKey(index.key, ANSWER_IDENTITY_INDEX_KEY) &&
  index.partialFilterExpression === undefined &&
  index.sparse !== true &&
  index.collation === undefined;

const countGroups = (rows: DuplicateGroupCount[]): number =>
  rows[0]?.groups ?? 0;

export async function inspectPairQuestionnaireIntegrity(): Promise<PairQuestionnaireIntegrityReport> {
  const [
    sessionDuplicateGroups,
    answerDuplicateGroups,
    sessionIndexes,
    answerIndexes,
  ] = await Promise.all([
      PairQuestionnaireSession.collection
        .aggregate<DuplicateGroupCount>([
          { $match: { status: 'in_progress' } },
          {
            $group: {
              _id: { pairId: '$pairId', questionnaireId: '$questionnaireId' },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $count: 'groups' },
        ])
        .toArray(),
      PairQuestionnaireAnswer.collection
        .aggregate<DuplicateGroupCount>([
          {
            $group: {
              _id: {
                sessionId: '$sessionId',
                questionId: '$questionId',
                by: '$by',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $count: 'groups' },
        ])
        .toArray(),
      readIndexes(PairQuestionnaireSession.collection),
      readIndexes(PairQuestionnaireAnswer.collection),
  ]);

  const canonicalSessionIndex = sessionIndexes.find(
    (index) => index.name === ACTIVE_SESSION_INDEX_NAME
  );
  const canonicalAnswerIndex = answerIndexes.find(
    (index) => index.name === ANSWER_IDENTITY_INDEX_NAME
  );
  const missingCanonicalIndexes: string[] = [];
  const conflictingCanonicalIndexes: string[] = [];

  if (!canonicalSessionIndex) {
    missingCanonicalIndexes.push(ACTIVE_SESSION_INDEX_NAME);
  } else if (!activeSessionIndexIsCanonical(canonicalSessionIndex)) {
    conflictingCanonicalIndexes.push(ACTIVE_SESSION_INDEX_NAME);
  }
  if (!canonicalAnswerIndex) {
    missingCanonicalIndexes.push(ANSWER_IDENTITY_INDEX_NAME);
  } else if (!answerIdentityIndexIsCanonical(canonicalAnswerIndex)) {
    conflictingCanonicalIndexes.push(ANSWER_IDENTITY_INDEX_NAME);
  }

  return {
    migrationVersion: PAIR_QUESTIONNAIRE_INTEGRITY_VERSION,
    duplicateActiveSessionGroups: countGroups(sessionDuplicateGroups),
    duplicateAnswerGroups: countGroups(answerDuplicateGroups),
    missingCanonicalIndexes,
    conflictingCanonicalIndexes,
  };
}

const assertSafeToApply = (report: PairQuestionnaireIntegrityReport): void => {
  if (
    report.duplicateActiveSessionGroups > 0 ||
    report.duplicateAnswerGroups > 0
  ) {
    throw new PairQuestionnaireIntegrityFailure('DUPLICATE_SOURCE_ROWS');
  }
  if (report.conflictingCanonicalIndexes.length > 0) {
    throw new PairQuestionnaireIntegrityFailure(
      'CONFLICTING_CANONICAL_INDEX'
    );
  }
};

export async function applyPairQuestionnaireIntegrityIndexes(): Promise<PairQuestionnaireIntegrityReport> {
  const before = await inspectPairQuestionnaireIntegrity();
  assertSafeToApply(before);

  if (before.missingCanonicalIndexes.includes(ACTIVE_SESSION_INDEX_NAME)) {
    await PairQuestionnaireSession.collection.createIndex(
      ACTIVE_SESSION_INDEX_KEY,
      {
        unique: true,
        partialFilterExpression: { status: 'in_progress' },
        name: ACTIVE_SESSION_INDEX_NAME,
      }
    );
  }
  if (before.missingCanonicalIndexes.includes(ANSWER_IDENTITY_INDEX_NAME)) {
    await PairQuestionnaireAnswer.collection.createIndex(
      ANSWER_IDENTITY_INDEX_KEY,
      { unique: true, name: ANSWER_IDENTITY_INDEX_NAME }
    );
  }

  const after = await inspectPairQuestionnaireIntegrity();
  assertSafeToApply(after);
  if (after.missingCanonicalIndexes.length > 0) {
    throw new PairQuestionnaireIntegrityFailure('INDEX_APPLY_INCOMPLETE');
  }
  return after;
}
