import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { pairsService } from '@/domain/services/pairs.service';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { EventLog } from '@/models/EventLog';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import {
  QUESTIONNAIRE_CONTENT_MODEL,
  Questionnaire,
  type QuestionItem,
} from '@/models/Questionnaire';
import { User } from '@/models/User';
import {
  ACTIVE_SESSION_INDEX_NAME,
  ANSWER_IDENTITY_INDEX_NAME,
  applyPairQuestionnaireIntegrityIndexes,
  inspectPairQuestionnaireIntegrity,
} from './lib/pair-questionnaire-integrity';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const assertSafeTestUri = (uri: string): void => {
  const parsed = new URL(uri);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (parsed.protocol !== 'mongodb:') {
    throw new Error('Integration requires a mongodb:// URI');
  }
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27018') {
    throw new Error('Integration is restricted to 127.0.0.1:27018');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('Integration requires a database ending in _test');
  }
  if (parsed.searchParams.get('directConnection') !== 'true') {
    throw new Error('Integration requires directConnection=true');
  }
};

assertSafeTestUri(mongodbUri);
process.env.JWT_SECRET = process.env.JWT_SECRET?.trim() || randomUUID();

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

const settle = async <T>(promise: Promise<T>): Promise<Settled<T>> => {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { ok: false, error };
  }
};

const assertDomainFailure = <T>(outcome: Settled<T>, status: number): void => {
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.ok(outcome.error instanceof DomainError);
  assert.equal(outcome.error.status, status);
};

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve = (): void => {
    throw new Error('Deferred promise was not initialized');
  };
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};

const runId = randomUUID();
const ownerUserId = `pair-qn-owner-${runId}`;
const partnerUserId = `pair-qn-partner-${runId}`;
const questionnaireId = `pair-qn-${runId}`;
const auditRequest = {
  route: '/integration/pair-questionnaire-concurrency',
  method: 'TEST',
};

const userFixture = (id: string) => ({
  id,
  username: id,
  avatar: 'avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
  },
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
  },
  profile: {
    onboarding: {
      seeking: {
        valuedQualities: ['kindness', 'honesty', 'respect'],
        relationshipPriority: 'emotional_intimacy' as const,
        minExperience: 'none' as const,
        dealBreakers: 'none',
        firstDateSetting: 'cafe' as const,
        weeklyTimeCommitment: '5-10h' as const,
      },
    },
  },
});

const question = (id: string): QuestionItem => ({
  id,
  domainKey: 'sharedLife',
  topicKey: `household.${id}`,
  scale: 'likert5',
  optionCount: 5,
  text: { ru: id, en: id },
  scope: 'pair',
  audience: 'couple',
  sensitivity: 'medium',
  locale: 'ru',
  contentRevision: `${id}-content-v1`,
});

const createPair = async (): Promise<Types.ObjectId> => {
  const pair = await Pair.create({
    members: [ownerUserId, partnerUserId],
    key: [ownerUserId, partnerUserId].sort().join('|'),
    status: 'active',
  });
  return pair._id;
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 30,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    const legacyPairId = new Types.ObjectId();
    const legacySessionId = new Types.ObjectId();
    const duplicateSessionId = new Types.ObjectId();
    const memberIds: [Types.ObjectId, Types.ObjectId] = [
      new Types.ObjectId(),
      new Types.ObjectId(),
    ];
    const now = new Date('2026-08-11T00:00:00.000Z');
    await PairQuestionnaireSession.collection.insertMany([
      {
        _id: legacySessionId,
        pairId: legacyPairId,
        questionnaireId: 'legacy-questionnaire',
        members: memberIds,
        startedAt: now,
        status: 'in_progress',
      },
      {
        _id: duplicateSessionId,
        pairId: legacyPairId,
        questionnaireId: 'legacy-questionnaire',
        members: memberIds,
        startedAt: now,
        status: 'in_progress',
      },
    ]);
    await PairQuestionnaireAnswer.collection.insertMany([
      {
        sessionId: legacySessionId,
        pairId: legacyPairId,
        questionnaireId: 'legacy-questionnaire',
        questionId: 'legacy-question',
        by: 'A',
        ui: 1,
        at: now,
      },
      {
        sessionId: legacySessionId,
        pairId: legacyPairId,
        questionnaireId: 'legacy-questionnaire',
        questionId: 'legacy-question',
        by: 'A',
        ui: 2,
        at: now,
      },
    ]);

    const duplicateReport = await inspectPairQuestionnaireIntegrity();
    assert.equal(duplicateReport.duplicateActiveSessionGroups, 1);
    assert.equal(duplicateReport.duplicateAnswerGroups, 1);
    assert.deepEqual(Object.keys(duplicateReport).sort(), [
      'conflictingCanonicalIndexes',
      'duplicateActiveSessionGroups',
      'duplicateAnswerGroups',
      'migrationVersion',
      'missingCanonicalIndexes',
    ]);
    const serializedDuplicateReport = JSON.stringify(duplicateReport);
    for (const forbiddenOutput of [
      String(legacyPairId),
      String(legacySessionId),
      'legacy-questionnaire',
      'legacy-question',
      'pairId',
      'sessionId',
      'questionnaireId',
      'questionId',
      'sessionDuplicateSamples',
      'answerDuplicateSamples',
    ]) {
      assert.equal(
        serializedDuplicateReport.includes(forbiddenOutput),
        false,
        `preflight report must omit ${forbiddenOutput}`
      );
    }
    const duplicateCountsBefore = await Promise.all([
      PairQuestionnaireSession.countDocuments(),
      PairQuestionnaireAnswer.countDocuments(),
    ]);
    await assert.rejects(
      applyPairQuestionnaireIntegrityIndexes(),
      /duplicate groups found/
    );
    assert.deepEqual(
      await Promise.all([
        PairQuestionnaireSession.countDocuments(),
        PairQuestionnaireAnswer.countDocuments(),
      ]),
      duplicateCountsBefore,
      'fail-closed migration must never delete or rewrite duplicates'
    );

    await Promise.all([
      PairQuestionnaireSession.deleteMany({}),
      PairQuestionnaireAnswer.deleteMany({}),
    ]);
    const appliedReport = await applyPairQuestionnaireIntegrityIndexes();
    assert.deepEqual(appliedReport.missingCanonicalIndexes, []);
    assert.deepEqual(appliedReport.conflictingCanonicalIndexes, []);
    const [sessionIndexes, answerIndexes] = await Promise.all([
      PairQuestionnaireSession.collection.indexes(),
      PairQuestionnaireAnswer.collection.indexes(),
    ]);
    assert.ok(
      sessionIndexes.some(
        (index) => index.name === ACTIVE_SESSION_INDEX_NAME && index.unique === true
      )
    );
    assert.ok(
      answerIndexes.some(
        (index) => index.name === ANSWER_IDENTITY_INDEX_NAME && index.unique === true
      )
    );

    await Promise.all([
      User.createIndexes(),
      Pair.createIndexes(),
      Questionnaire.createIndexes(),
      EventLog.createIndexes(),
    ]);
    await User.create([userFixture(ownerUserId), userFixture(partnerUserId)]);
    const questions = [question(`${runId}-q1`), question(`${runId}-q2`)];
    await Questionnaire.create({
      _id: questionnaireId,
      contentModel: QUESTIONNAIRE_CONTENT_MODEL,
      publicationStatus: 'published',
      reviewedAt: now,
      publishedAt: now,
      title: { ru: 'Парная анкета', en: 'Pair questionnaire' },
      description: { ru: 'Проверка конкурентности', en: 'Concurrency check' },
      difficulty: 1,
      tags: ['integration'],
      version: 1,
      randomize: false,
      target: { type: 'couple', gender: 'unisex' },
      domainKey: 'sharedLife',
      questions,
    });

    const concurrentPairId = await createPair();
    const startResults = await Promise.all(
      Array.from({ length: 12 }, () =>
        questionnairesService.startPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          currentUserId: ownerUserId,
          auditRequest,
        })
      )
    );
    assert.equal(new Set(startResults.map((item) => item.sessionId)).size, 1);
    const concurrentSessionId = new Types.ObjectId(startResults[0]!.sessionId);
    assert.equal(
      await PairQuestionnaireSession.countDocuments({
        pairId: concurrentPairId,
        questionnaireId,
        status: 'in_progress',
      }),
      1
    );

    const sameAnswerResults = await Promise.all(
      Array.from({ length: 12 }, () =>
        questionnairesService.answerPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          sessionId: String(concurrentSessionId),
          questionId: questions[0]!.id,
          ui: 3,
          currentUserId: ownerUserId,
          auditRequest,
        })
      )
    );
    assert.deepEqual(sameAnswerResults, Array.from({ length: 12 }, () => ({})));
    assert.equal(
      await PairQuestionnaireAnswer.countDocuments({
        sessionId: concurrentSessionId,
        questionId: questions[0]!.id,
        by: 'A',
      }),
      1
    );

    const conflictingAnswers = await Promise.all([
      settle(
        questionnairesService.answerPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          sessionId: String(concurrentSessionId),
          questionId: questions[1]!.id,
          ui: 2,
          currentUserId: ownerUserId,
          auditRequest,
        })
      ),
      settle(
        questionnairesService.answerPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          sessionId: String(concurrentSessionId),
          questionId: questions[1]!.id,
          ui: 5,
          currentUserId: ownerUserId,
          auditRequest,
        })
      ),
    ]);
    assert.equal(conflictingAnswers.filter((outcome) => outcome.ok).length, 1);
    const rejectedConflict = conflictingAnswers.find((outcome) => !outcome.ok);
    assert.ok(rejectedConflict);
    assertDomainFailure(rejectedConflict, 409);
    assert.equal(
      await PairQuestionnaireAnswer.countDocuments({
        sessionId: concurrentSessionId,
        questionId: questions[1]!.id,
        by: 'A',
      }),
      1
    );

    await Pair.updateOne(
      { _id: concurrentPairId, status: 'active' },
      { $set: { status: 'paused' }, $inc: { lifecycleRevision: 1 } }
    );
    const answersBeforePauseAttempt = await PairQuestionnaireAnswer.countDocuments({
      sessionId: concurrentSessionId,
    });
    assertDomainFailure(
      await settle(
        questionnairesService.startPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          currentUserId: ownerUserId,
          auditRequest,
        })
      ),
      409
    );
    assertDomainFailure(
      await settle(
        questionnairesService.answerPairQuestionnaire({
          pairId: String(concurrentPairId),
          questionnaireId,
          sessionId: String(concurrentSessionId),
          questionId: questions[0]!.id,
          ui: 3,
          currentUserId: ownerUserId,
          auditRequest,
        })
      ),
      409
    );
    assert.equal(
      await PairQuestionnaireAnswer.countDocuments({ sessionId: concurrentSessionId }),
      answersBeforePauseAttempt
    );

    const startRacePairId = await createPair();
    const startEnteredFence = deferred();
    const releaseStartFence = deferred();
    const startVsEnd = settle(
      questionnairesService.startPairQuestionnaire(
        {
          pairId: String(startRacePairId),
          questionnaireId,
          currentUserId: ownerUserId,
          auditRequest,
        },
        {
          beforePairFence: async () => {
            startEnteredFence.resolve();
            await releaseStartFence.promise;
          },
        }
      )
    );
    await startEnteredFence.promise;
    await pairsService.endPair({
      pairId: String(startRacePairId),
      currentUserId: ownerUserId,
      auditRequest,
    });
    releaseStartFence.resolve();
    assertDomainFailure(await startVsEnd, 409);
    assert.equal(
      await PairQuestionnaireSession.countDocuments({ pairId: startRacePairId }),
      0
    );

    const answerRacePairId = await createPair();
    const answerRaceSession = await questionnairesService.startPairQuestionnaire({
      pairId: String(answerRacePairId),
      questionnaireId,
      currentUserId: ownerUserId,
      auditRequest,
    });
    const answerEnteredFence = deferred();
    const releaseAnswerFence = deferred();
    const answerVsEnd = settle(
      questionnairesService.answerPairQuestionnaire(
        {
          pairId: String(answerRacePairId),
          questionnaireId,
          sessionId: answerRaceSession.sessionId,
          questionId: questions[0]!.id,
          ui: 4,
          currentUserId: ownerUserId,
          auditRequest,
        },
        {
          beforePairFence: async () => {
            answerEnteredFence.resolve();
            await releaseAnswerFence.promise;
          },
        }
      )
    );
    await answerEnteredFence.promise;
    await pairsService.endPair({
      pairId: String(answerRacePairId),
      currentUserId: partnerUserId,
      auditRequest,
    });
    releaseAnswerFence.resolve();
    assertDomainFailure(await answerVsEnd, 409);
    assert.equal(
      await PairQuestionnaireAnswer.countDocuments({
        sessionId: new Types.ObjectId(answerRaceSession.sessionId),
      }),
      0
    );
    const closedSession = await PairQuestionnaireSession.findById(
      answerRaceSession.sessionId
    ).lean();
    assert.equal(closedSession?.status, 'closed');
    assert.ok(closedSession?.finishedAt);
    assert.equal(closedSession?.meta?.lifecycleClosure, 'PAIR_ENDED');

    const finalReport = await inspectPairQuestionnaireIntegrity();
    assert.equal(finalReport.duplicateActiveSessionGroups, 0);
    assert.equal(finalReport.duplicateAnswerGroups, 0);
    assert.deepEqual(finalReport.missingCanonicalIndexes, []);
    console.log(
      JSON.stringify({
        integration: 'pair-questionnaire-concurrency',
        duplicateStarts: startResults.length,
        duplicateAnswers: sameAnswerResults.length,
        conflictingAnswerRejections: 1,
        startVsEnd: 'blocked',
        answerVsEnd: 'blocked-and-session-closed',
      })
    );
  } finally {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
