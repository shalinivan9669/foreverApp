import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { accountDeletionService } from '@/domain/services/accountDeletion.service';
import { privacyExportService } from '@/domain/services/privacyExport.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { DomainError } from '@/domain/errors';
import { EventLog } from '@/models/EventLog';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';
import { PrivacyRequest } from '@/models/PrivacyRequest';
import {
  QUESTIONNAIRE_CONTENT_MODEL,
  Questionnaire,
  type QuestionItem,
} from '@/models/Questionnaire';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';

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

const runId = randomUUID();
const ownerUserId = `questionnaire-owner-${runId}`;
const partnerUserId = `questionnaire-partner-${runId}`;
const personalQuestionnaireId = `questionnaire-personal-${runId}`;
const pairQuestionnaireId = `questionnaire-pair-${runId}`;
const pairKey = [ownerUserId, partnerUserId].sort().join('|');
const privacyRequestIds: Types.ObjectId[] = [];
const auditRequest = {
  route: '/integration/questionnaire-new-only',
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

const question = (input: {
  id: string;
  domainKey: string;
  topicKey: string;
  scale?: 'likert5' | 'bool';
}): QuestionItem => ({
  id: input.id,
  domainKey: input.domainKey,
  topicKey: input.topicKey,
  scale: input.scale ?? 'likert5',
  optionCount: input.scale === 'bool' ? 2 : 5,
  text: { ru: input.id, en: input.id },
  scope: 'pair_or_solo',
  audience: 'personal',
  sensitivity: 'medium',
  locale: 'ru',
  contentRevision: `${input.id}-content-v1`,
});

const publicationFields = {
  contentModel: QUESTIONNAIRE_CONTENT_MODEL,
  publicationStatus: 'published' as const,
  reviewedAt: new Date('2026-08-11T00:00:00.000Z'),
  publishedAt: new Date('2026-08-11T00:00:00.000Z'),
  title: { ru: 'Интеграционная анкета', en: 'Integration questionnaire' },
  description: { ru: 'Проверка', en: 'Check' },
  difficulty: 1 as const,
  tags: ['integration'],
  version: 1,
  randomize: false,
};

const expectDomainError = async (
  action: () => Promise<unknown>,
  status: number
): Promise<void> => {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.status, status);
    return true;
  });
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  let pairId: Types.ObjectId | null = null;
  try {
    await Promise.all([
      User.createIndexes(),
      Pair.createIndexes(),
      Questionnaire.createIndexes(),
      PersonalQuestionnaireSubmission.createIndexes(),
      PrivacyRequest.createIndexes(),
      SessionSubject.createIndexes(),
    ]);

    await User.create([userFixture(ownerUserId), userFixture(partnerUserId)]);
    const pair = await Pair.create({
      members: [ownerUserId, partnerUserId],
      key: pairKey,
      status: 'active',
    });
    pairId = pair._id;

    const personalQuestions = [
      question({
        id: `${runId}-personal-q1`,
        domainKey: 'communication',
        topicKey: 'conversation.directness',
      }),
      question({
        id: `${runId}-personal-q2`,
        domainKey: 'wellbeing',
        topicKey: 'resource.readiness',
        scale: 'bool',
      }),
    ];
    const pairQuestions = [
      question({
        id: `${runId}-pair-q1`,
        domainKey: 'sharedLife',
        topicKey: 'household.expectation',
      }),
      question({
        id: `${runId}-pair-q2`,
        domainKey: 'lifePlans',
        topicKey: 'relationship.sharedTime',
      }),
    ].map((item) => ({ ...item, audience: 'couple' as const, scope: 'pair' as const }));

    await Questionnaire.create([
      {
        _id: personalQuestionnaireId,
        ...publicationFields,
        target: { type: 'individual', gender: 'unisex' },
        domainKey: 'communication',
        questions: personalQuestions,
      },
      {
        _id: pairQuestionnaireId,
        ...publicationFields,
        target: { type: 'couple', gender: 'unisex' },
        domainKey: 'sharedLife',
        questions: pairQuestions,
      },
    ]);

    await expectDomainError(
      () =>
        questionnairesService.submitBulkAnswers({
          currentUserId: ownerUserId,
          questionnaireId: personalQuestionnaireId,
          answers: [{ qid: personalQuestions[0].id, ui: 3 }],
          auditRequest,
        }),
      400
    );
    await expectDomainError(
      () =>
        questionnairesService.submitBulkAnswers({
          currentUserId: ownerUserId,
          questionnaireId: personalQuestionnaireId,
          answers: [
            { qid: personalQuestions[0].id, ui: 0 },
            { qid: personalQuestions[1].id, ui: 1 },
          ],
          auditRequest,
        }),
      400
    );

    const firstAnswers = [
      { qid: personalQuestions[0].id, ui: 4 },
      { qid: personalQuestions[1].id, ui: 2 },
    ];
    const retryResults = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        questionnairesService.submitBulkAnswers({
          currentUserId: ownerUserId,
          questionnaireId: personalQuestionnaireId,
          answers: index % 2 === 0 ? firstAnswers : [...firstAnswers].reverse(),
          auditRequest,
        })
      )
    );
    assert.deepEqual(retryResults, Array.from({ length: 8 }, () => ({})));

    const firstStored = await PersonalQuestionnaireSubmission.findOne({
      userId: ownerUserId,
      questionnaireId: personalQuestionnaireId,
    }).lean();
    assert.ok(firstStored);
    assert.equal(
      await PersonalQuestionnaireSubmission.countDocuments({
        userId: ownerUserId,
        questionnaireId: personalQuestionnaireId,
      }),
      1
    );
    assert.equal(firstStored.captureMode, 'PRIVATE');
    assert.equal(firstStored.retentionClass, 'OWNER_CONTROLLED');
    assert.equal(firstStored.semanticStatus, 'UNMAPPED');
    assert.equal(firstStored.questionnaireContentModel, QUESTIONNAIRE_CONTENT_MODEL);

    await questionnairesService.submitBulkAnswers({
      currentUserId: ownerUserId,
      questionnaireId: personalQuestionnaireId,
      answers: [
        { qid: personalQuestions[0].id, ui: 5 },
        { qid: personalQuestions[1].id, ui: 2 },
      ],
      auditRequest,
    });
    const ownerHistory = await PersonalQuestionnaireSubmission.find({
      userId: ownerUserId,
      questionnaireId: personalQuestionnaireId,
    })
      .sort({ createdAt: 1 })
      .lean();
    assert.equal(ownerHistory.length, 2);
    assert.equal(ownerHistory[0]?.submissionId, firstStored.submissionId);
    assert.deepEqual(ownerHistory[0]?.answers, firstStored.answers);

    await questionnairesService.submitBulkAnswers({
      currentUserId: partnerUserId,
      questionnaireId: personalQuestionnaireId,
      answers: [
        { qid: personalQuestions[0].id, ui: 1 },
        { qid: personalQuestions[1].id, ui: 1 },
      ],
      auditRequest,
    });
    const partnerSubmission = await PersonalQuestionnaireSubmission.findOne({
      userId: partnerUserId,
      questionnaireId: personalQuestionnaireId,
    }).lean();
    assert.ok(partnerSubmission);

    assert.equal(
      await EvidenceEvent.countDocuments({
        actorId: { $in: [ownerUserId, partnerUserId] },
        sourceType: 'QUESTIONNAIRE',
      }),
      0
    );
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({
        subjectId: { $in: [ownerUserId, partnerUserId] },
      }),
      0
    );

    const canonicalPairBefore = await Pair.findById(pair._id)
      .select({
        members: 1,
        key: 1,
        status: 1,
        contextVersion: 1,
        activeActivity: 1,
        progress: 1,
      })
      .lean();
    const started = await questionnairesService.startPairQuestionnaire({
      pairId: String(pair._id),
      questionnaireId: pairQuestionnaireId,
      currentUserId: ownerUserId,
      auditRequest,
    });
    await expectDomainError(
      () =>
        questionnairesService.answerPairQuestionnaire({
          pairId: String(pair._id),
          questionnaireId: pairQuestionnaireId,
          sessionId: started.sessionId,
          questionId: pairQuestions[0].id,
          ui: 0,
          currentUserId: ownerUserId,
          auditRequest,
        }),
      400
    );

    const ownerPairResults = [];
    for (const [index, item] of pairQuestions.entries()) {
      ownerPairResults.push(
        await questionnairesService.answerPairQuestionnaire({
          pairId: String(pair._id),
          questionnaireId: pairQuestionnaireId,
          sessionId: started.sessionId,
          questionId: item.id,
          ui: index + 1,
          currentUserId: ownerUserId,
          auditRequest,
        })
      );
    }
    const partnerPairResults = [];
    for (const [index, item] of pairQuestions.entries()) {
      partnerPairResults.push(
        await questionnairesService.answerPairQuestionnaire({
          pairId: String(pair._id),
          questionnaireId: pairQuestionnaireId,
          sessionId: started.sessionId,
          questionId: item.id,
          ui: index + 4,
          currentUserId: partnerUserId,
          auditRequest,
        })
      );
    }
    assert.deepEqual(ownerPairResults, [{}, {}]);
    assert.deepEqual(partnerPairResults, [{}, {}]);
    assert.equal(
      await PairQuestionnaireSession.countDocuments({
        _id: new Types.ObjectId(started.sessionId),
        status: 'completed',
      }),
      1
    );
    const canonicalPairAfter = await Pair.findById(pair._id)
      .select({
        members: 1,
        key: 1,
        status: 1,
        contextVersion: 1,
        activeActivity: 1,
        progress: 1,
      })
      .lean();
    assert.deepEqual(canonicalPairAfter, canonicalPairBefore);
    assert.deepEqual(
      await Pair.collection.findOne(
        { _id: pair._id },
        { projection: { _id: 0, passport: 1, readiness: 1, fatigue: 1 } }
      ),
      {}
    );

    const ownerExport = await privacyExportService.buildOwnerExport({
      ownerUserId,
      auditRequest,
    });
    assert.equal(ownerExport.personalQuestionnaireSubmissions.items.length, 2);
    assert.equal(
      ownerExport.personalQuestionnaireSubmissions.items.every(
        (item) => item.captureMode === 'PRIVATE' && item.semanticStatus === 'UNMAPPED'
      ),
      true
    );
    assert.doesNotMatch(
      JSON.stringify(ownerExport),
      new RegExp(partnerSubmission.submissionId)
    );
    assert.deepEqual(
      ownerExport.pairQuestionnaireAnswers.items.map((item) => item.ui).sort(),
      [1, 2]
    );

    const deletionRequest = await privacyRequestService.requestDeletion({
      ownerUserId,
      auditRequest,
    });
    privacyRequestIds.push(new Types.ObjectId(deletionRequest.id));
    const deletion = await accountDeletionService.execute({
      ownerUserId,
      sessionVersion:
        await sessionRevocationService.getOrCreateVersion(ownerUserId),
      auditRequest,
    });
    assert.equal(deletion.status, 'EXECUTED');
    assert.equal(
      await PersonalQuestionnaireSubmission.countDocuments({ userId: ownerUserId }),
      0
    );
    assert.equal(
      await PersonalQuestionnaireSubmission.countDocuments({ userId: partnerUserId }),
      1
    );

    console.log('questionnaire NEW_ONLY integration passed');
  } finally {
    const pairFilter = pairId ? { pairId } : { pairId: new Types.ObjectId() };
    await Promise.all([
      PersonalQuestionnaireSubmission.deleteMany({
        userId: { $in: [ownerUserId, partnerUserId] },
      }),
      PairQuestionnaireAnswer.deleteMany(pairFilter),
      PairQuestionnaireSession.deleteMany(pairFilter),
      Pair.deleteMany({ key: pairKey }),
      Questionnaire.deleteMany({
        _id: { $in: [personalQuestionnaireId, pairQuestionnaireId] },
      }),
      PrivacyRequest.deleteMany({ _id: { $in: privacyRequestIds } }),
      SessionSubject.deleteMany({ userId: { $in: [ownerUserId, partnerUserId] } }),
      EventLog.deleteMany({
        'actor.userId': { $in: [ownerUserId, partnerUserId] },
      }),
      User.deleteMany({ id: { $in: [ownerUserId, partnerUserId] } }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
