import mongoose, { Types } from 'mongoose';
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

type DuplicateSummary = { groups: number };
type SessionDuplicateRow = {
  _id: { pairId: Types.ObjectId; questionnaireId: string };
  count: number;
};
type AnswerDuplicateRow = {
  _id: { sessionId: Types.ObjectId; questionId: string; by: 'A' | 'B' };
  count: number;
};
type DuplicateFacet<Row> = {
  summary: DuplicateSummary[];
  samples: Row[];
};

export type PairQuestionnaireIntegrityReport = {
  migrationVersion: typeof PAIR_QUESTIONNAIRE_INTEGRITY_VERSION;
  duplicateActiveSessionGroups: number;
  duplicateAnswerGroups: number;
  sessionDuplicateSamples: Array<{
    pairId: string;
    questionnaireId: string;
    count: number;
  }>;
  answerDuplicateSamples: Array<{
    sessionId: string;
    questionId: string;
    by: 'A' | 'B';
    count: number;
  }>;
  missingCanonicalIndexes: string[];
  conflictingCanonicalIndexes: string[];
};

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

const countGroups = (summary: DuplicateSummary[]): number =>
  summary[0]?.groups ?? 0;

export async function inspectPairQuestionnaireIntegrity(): Promise<PairQuestionnaireIntegrityReport> {
  const [sessionFacets, answerFacets, sessionIndexes, answerIndexes] =
    await Promise.all([
      PairQuestionnaireSession.collection
        .aggregate<DuplicateFacet<SessionDuplicateRow>>([
          { $match: { status: 'in_progress' } },
          {
            $group: {
              _id: { pairId: '$pairId', questionnaireId: '$questionnaireId' },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          {
            $facet: {
              summary: [{ $count: 'groups' }],
              samples: [{ $sort: { count: -1 } }, { $limit: 10 }],
            },
          },
        ])
        .toArray(),
      PairQuestionnaireAnswer.collection
        .aggregate<DuplicateFacet<AnswerDuplicateRow>>([
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
          {
            $facet: {
              summary: [{ $count: 'groups' }],
              samples: [{ $sort: { count: -1 } }, { $limit: 10 }],
            },
          },
        ])
        .toArray(),
      readIndexes(PairQuestionnaireSession.collection),
      readIndexes(PairQuestionnaireAnswer.collection),
    ]);

  const sessionFacet = sessionFacets[0] ?? { summary: [], samples: [] };
  const answerFacet = answerFacets[0] ?? { summary: [], samples: [] };
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
    duplicateActiveSessionGroups: countGroups(sessionFacet.summary),
    duplicateAnswerGroups: countGroups(answerFacet.summary),
    sessionDuplicateSamples: sessionFacet.samples.map((row) => ({
      pairId: String(row._id.pairId),
      questionnaireId: row._id.questionnaireId,
      count: row.count,
    })),
    answerDuplicateSamples: answerFacet.samples.map((row) => ({
      sessionId: String(row._id.sessionId),
      questionId: row._id.questionId,
      by: row._id.by,
      count: row.count,
    })),
    missingCanonicalIndexes,
    conflictingCanonicalIndexes,
  };
}

const assertSafeToApply = (report: PairQuestionnaireIntegrityReport): void => {
  if (
    report.duplicateActiveSessionGroups > 0 ||
    report.duplicateAnswerGroups > 0
  ) {
    throw new Error(
      `Questionnaire integrity migration refused duplicate source rows: ` +
        `activeSessionGroups=${report.duplicateActiveSessionGroups} ` +
        `answerGroups=${report.duplicateAnswerGroups}`
    );
  }
  if (report.conflictingCanonicalIndexes.length > 0) {
    throw new Error(
      `Questionnaire integrity migration refused conflicting indexes: ` +
        report.conflictingCanonicalIndexes.join(',')
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
    throw new Error(
      `Questionnaire integrity migration did not create indexes: ` +
        after.missingCanonicalIndexes.join(',')
    );
  }
  return after;
}
