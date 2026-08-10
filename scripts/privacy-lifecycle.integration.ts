import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose, { Types } from 'mongoose';
import { privacyExportService } from '@/domain/services/privacyExport.service';
import { privacyRequestService } from '@/domain/services/privacyRequest.service';
import {
  enforceRateLimit,
  RATE_LIMIT_POLICIES,
} from '@/lib/abuse/rateLimit';
import { EventLog } from '@/models/EventLog';
import { Like } from '@/models/Like';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { PartnerSignal } from '@/models/PartnerSignal';
import { PrivacyRequest } from '@/models/PrivacyRequest';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { User } from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');
const databaseName = new URL(mongodbUri).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Privacy integration requires a database ending in _test');
}

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

const runId = randomUUID();
const ownerUserId = `privacy-owner-${runId}`;
const partnerUserId = `privacy-partner-${runId}`;
const pairKey = [ownerUserId, partnerUserId].sort().join('|');
const ownerSecret = `owner-private-note-${runId}`;
const partnerWeeklySecret = `partner-weekly-secret-${runId}`;
const partnerLikeSecret = `partner-like-secret-${runId}`;
const partnerHiddenSignal = `partner-hidden-signal-${runId}`;

const auditRequest = {
  route: '/api/privacy/integration',
  method: 'TEST',
};

const userFixture = (id: string, username: string) => ({
  id,
  username,
  avatar: 'avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
  },
  vectors: {},
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

const weeklyFixture = (params: {
  userId: string;
  pairId: Types.ObjectId;
  note: string;
  closeness: number;
}) => ({
  userId: params.userId,
  pairId: params.pairId,
  weekKey: '2026-W32',
  answers: {
    closeness: params.closeness,
    fatigue: 0.4,
    irritation: 0.2,
    readiness: 0.8,
    unresolvedTopic: false,
    note: params.note,
  },
  computed: { userStateDelta: {}, generatedInsightIds: [] },
});

const assertRouteBoundaries = (): void => {
  const exportRoute = source('src/app/api/privacy/export/route.ts');
  const deletionRoute = source(
    'src/app/api/privacy/deletion-request/route.ts'
  );
  const rateLimits = source('src/lib/abuse/rateLimit.ts');

  for (const route of [exportRoute, deletionRoute]) {
    assert.match(route, /requireSession\(req\)/);
    assert.doesNotMatch(route, /ownerUserId:\s*(body|query|params)/);
  }
  assert.match(exportRoute, /RATE_LIMIT_POLICIES\.privacyExport/);
  assert.match(
    deletionRoute,
    /RATE_LIMIT_POLICIES\.privacyDeletionStatus/
  );
  assert.match(
    deletionRoute,
    /RATE_LIMIT_POLICIES\.privacyDeletionMutation/
  );
  assert.match(rateLimits, /name:\s*'privacy-export'/);
  assert.match(rateLimits, /name:\s*'privacy-deletion-mutation'/);
  assert.match(rateLimits, /keying:\s*'user'/);
};

const main = async (): Promise<void> => {
  assertRouteBoundaries();
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  let pairId: Types.ObjectId | null = null;
  try {
    await PrivacyRequest.createIndexes();
    const [owner, partner] = await User.create([
      userFixture(ownerUserId, 'owner'),
      userFixture(partnerUserId, 'partner'),
    ]);
    const pair = await Pair.create({
      members: [ownerUserId, partnerUserId],
      key: pairKey,
      status: 'active',
    });
    pairId = pair._id;

    await Promise.all([
      WeeklyCheckIn.create(
        weeklyFixture({
          userId: ownerUserId,
          pairId,
          note: ownerSecret,
          closeness: 0.7,
        })
      ),
      WeeklyCheckIn.create(
        weeklyFixture({
          userId: partnerUserId,
          pairId,
          note: partnerWeeklySecret,
          closeness: 0.3,
        })
      ),
      MvpOnboardingSession.create({
        userId: ownerUserId,
        status: 'completed',
        contentRevision: 'privacy-test-v1',
        policyVersion: 'privacy-test-v1',
        consent: {
          adultConfirmed: true,
          voluntaryParticipationConfirmed: true,
          privacyAcknowledged: true,
          confirmedAt: new Date('2026-08-10T08:00:00.000Z'),
        },
        cursor: 1,
        answers: [
          {
            questionId: 'owner-question',
            questionRevision: 'v1',
            answerRevision: 1,
            capturePolicy: 'PRIVATE',
            value: { kind: 'single', optionId: 'owner-option' },
            answeredAt: new Date('2026-08-10T08:01:00.000Z'),
          },
        ],
        startedAt: new Date('2026-08-10T08:00:00.000Z'),
        completedAt: new Date('2026-08-10T08:01:00.000Z'),
      }),
      Like.create({
        fromId: ownerUserId,
        toId: partnerUserId,
        matchScore: 0.93,
        fromCardSnapshot: {
          requirements: ['owner-a', 'owner-b', 'owner-c'],
          questions: ['owner-q1', 'owner-q2'],
        },
        recipientResponse: {
          agreements: [true, true, true],
          answers: [partnerLikeSecret, partnerLikeSecret],
          initiatorCardSnapshot: {
            requirements: ['owner-a', 'owner-b', 'owner-c'],
            questions: ['owner-q1', 'owner-q2'],
          },
          at: new Date('2026-08-10T08:02:00.000Z'),
        },
        status: 'awaiting_initiator',
      }),
      PartnerSignal.create({
        pairId,
        fromUserId: partnerUserId,
        toUserId: ownerUserId,
        sourceCheckInId: new Types.ObjectId(),
        dateKey: '2026-08-10',
        text: partnerHiddenSignal,
        tone: 'neutral',
        status: 'hidden_by_sender',
      }),
      PairQuestionnaireAnswer.create({
        sessionId: new Types.ObjectId(),
        pairId,
        questionnaireId: 'owner-questionnaire',
        questionId: 'owner-answer',
        by: pair.members[0] === ownerUserId ? 'A' : 'B',
        ui: 4,
        at: new Date('2026-08-10T08:03:00.000Z'),
      }),
      PairQuestionnaireAnswer.create({
        sessionId: new Types.ObjectId(),
        pairId,
        questionnaireId: 'partner-questionnaire-secret',
        questionId: 'partner-answer-secret',
        by: pair.members[0] === partnerUserId ? 'A' : 'B',
        ui: 5,
        at: new Date('2026-08-10T08:03:00.000Z'),
      }),
      PairStateSnapshot.create({
        pairId,
        cycleId: new Types.ObjectId(),
        cycleKey: '2026-W32',
        revision: 1,
        memberCompletion: [
          { userId: partnerUserId, status: 'SUBMITTED' },
          { userId: ownerUserId, status: 'SUBMITTED' },
        ],
        dataStatus: 'ENOUGH',
        reasonCodes: ['PAIR_SIGNALS_READY'],
        signals: [
          {
            key: 'connection',
            status: 'STEADY',
            reasonCode: 'PAIR_LEVEL_STEADY',
            nextStepHint: 'KEEP_CURRENT_RHYTHM',
          },
        ],
        input: {
          definitionVersion: 'privacy-test-v1',
          evidenceRevisionIds: ['private-evidence-id'],
          hash: 'f'.repeat(64),
          cycleStatus: 'OPEN',
          timeZone: 'UTC',
        },
        algorithm: { version: 'privacy-test-v1' },
        displayVersion: 'privacy-test-v1',
        generatedAt: new Date('2026-08-10T08:04:00.000Z'),
      }),
      PairActivity.create({
        pairId,
        members: [owner._id, partner._id],
        intent: 'improve',
        archetype: 'dialogue',
        axis: ['communication'],
        title: { ru: 'Общее действие', en: 'Shared action' },
        why: { ru: 'Нейтральная причина', en: 'Neutral reason' },
        mode: 'together',
        sync: 'sync',
        difficulty: 1,
        intensity: 1,
        offeredAt: new Date('2026-08-10T08:05:00.000Z'),
        status: 'completed_success',
        lifecycleVersion: 'activity-lifecycle-v2',
        feedbackSchemaVersion: 'activity-feedback-v2',
        visibility: 'both',
        checkIns: [],
        answers: [],
        resultSummary: {
          submittedBy: ['A', 'B'],
          submittedCount: 2,
          bothSubmitted: true,
          successScore: 0.93,
          status: 'completed_success',
          feedbackSchemaVersion: 'activity-feedback-v2',
          effectApplied: true,
          effect: {
            fatigueDelta: -0.1,
            readinessDelta: 0.1,
            axisDeltas: [{ axis: 'communication', delta: 0.1 }],
          },
          effectExplanation: { ru: 'private-derived-effect' },
          completedAt: new Date('2026-08-10T08:06:00.000Z'),
          resultVersion: 'activity-result-v1',
        },
        createdBy: 'system',
      }),
    ]);

    const privacyExport = await privacyExportService.buildOwnerExport({
      ownerUserId,
      auditRequest,
    });
    const exportJson = JSON.stringify(privacyExport);
    assert.match(exportJson, new RegExp(ownerSecret));
    assert.match(exportJson, /owner-option/);
    assert.doesNotMatch(exportJson, new RegExp(partnerUserId));
    assert.doesNotMatch(exportJson, new RegExp(partnerWeeklySecret));
    assert.doesNotMatch(exportJson, new RegExp(partnerLikeSecret));
    assert.doesNotMatch(exportJson, new RegExp(partnerHiddenSignal));
    assert.doesNotMatch(exportJson, /partner-questionnaire-secret/);
    assert.doesNotMatch(
      exportJson,
      /matchScore|successScore|effectApplied|private-evidence-id|private-derived-effect/
    );
    assert.equal(
      privacyExport.sharedActivities.items[0]?.resultSummary?.dataStatus,
      'ENOUGH'
    );
    assert.deepEqual(
      privacyExport.pairStateSummaries.items[0]?.memberCompletion,
      [
        { member: 'partner', status: 'SUBMITTED' },
        { member: 'owner', status: 'SUBMITTED' },
      ]
    );

    const concurrentRequests = await Promise.all(
      Array.from({ length: 8 }, () =>
        privacyRequestService.requestDeletion({ ownerUserId, auditRequest })
      )
    );
    assert.equal(new Set(concurrentRequests.map((item) => item.id)).size, 1);
    assert.equal(
      await PrivacyRequest.countDocuments({
        ownerUserId,
        status: 'PENDING_POLICY_REVIEW',
      }),
      1
    );
    assert.equal(concurrentRequests[0].executionState, 'NOT_STARTED');
    assert.equal(concurrentRequests[0].accountAndSessions, 'UNCHANGED');

    const cancelled = await privacyRequestService.cancelDeletion({
      ownerUserId,
      auditRequest,
    });
    assert.equal(cancelled?.status, 'CANCELLED');
    assert.equal(cancelled?.executionState, 'NOT_STARTED');
    assert.equal(await privacyRequestService.getCurrent(ownerUserId), null);
    assert.equal(
      await privacyRequestService.cancelDeletion({ ownerUserId, auditRequest }),
      null
    );

    const reopened = await privacyRequestService.requestDeletion({
      ownerUserId,
      auditRequest,
    });
    assert.equal(reopened.status, 'PENDING_POLICY_REVIEW');
    assert.notEqual(reopened.id, cancelled?.id);
    assert.equal(await User.countDocuments({ id: ownerUserId }), 1);

    assert.equal(
      await EventLog.countDocuments({
        'actor.userId': ownerUserId,
        event: 'PRIVACY_EXPORT_CREATED',
      }),
      1
    );
    assert.equal(
      await EventLog.countDocuments({
        'actor.userId': ownerUserId,
        event: 'PRIVACY_DELETION_CANCELLED',
      }),
      1
    );

    const rateRequest = new Request('https://app.example/api/privacy/export');
    const enforceExportRate = () =>
      enforceRateLimit({
        req: rateRequest,
        policy: RATE_LIMIT_POLICIES.privacyExport,
        userId: ownerUserId,
      });
    const firstRate = await enforceExportRate();
    const secondRate = await enforceExportRate();
    const thirdRate = await enforceExportRate();
    assert.equal(firstRate.ok, true);
    assert.equal(secondRate.ok, true);
    assert.equal(thirdRate.ok, false);
    if (!thirdRate.ok) {
      assert.equal(thirdRate.response.status, 429);
    }

    console.log('privacy lifecycle integration passed');
  } finally {
    const pairFilter = pairId ? { pairId } : { pairId: new Types.ObjectId() };
    await Promise.all([
      PrivacyRequest.deleteMany({ ownerUserId }),
      RateLimitBucket.deleteMany({ key: `user:${ownerUserId}` }),
      EventLog.deleteMany({ 'actor.userId': ownerUserId }),
      WeeklyCheckIn.deleteMany({
        userId: { $in: [ownerUserId, partnerUserId] },
      }),
      MvpOnboardingSession.deleteMany({
        userId: { $in: [ownerUserId, partnerUserId] },
      }),
      Like.deleteMany({
        $or: [
          { fromId: ownerUserId },
          { fromId: partnerUserId },
          { toId: ownerUserId },
          { toId: partnerUserId },
        ],
      }),
      PartnerSignal.deleteMany(pairFilter),
      PairQuestionnaireAnswer.deleteMany(pairFilter),
      PairStateSnapshot.deleteMany(pairFilter),
      PairActivity.deleteMany(pairFilter),
      Pair.deleteMany({ key: pairKey }),
      User.deleteMany({ id: { $in: [ownerUserId, partnerUserId] } }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
