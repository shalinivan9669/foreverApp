import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import {
  MVP_ONBOARDING_CONTENT_REVISION,
  MVP_ONBOARDING_POLICY_VERSION,
  MVP_ONBOARDING_QUESTIONS,
  mvpOnboardingService,
  type MvpOnboardingAnswerInput,
} from '@/domain/services/mvpOnboarding.service';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';

const mongodbUri =
  process.env.FACTOR_ENGINE_TEST_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  'mongodb://127.0.0.1:27018/foreverapp_factor_engine_test?directConnection=true';
const parsedUri = new URL(mongodbUri);
const databaseName = parsedUri.pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Onboarding Factor integration requires a database ending in _test');
}
if (parsedUri.searchParams.get('directConnection') !== 'true') {
  throw new Error('Onboarding Factor integration requires directConnection=true');
}
process.env.MONGODB_URI = mongodbUri;

const runId = randomUUID();
const subjectId = `onboarding-factor-${runId}`;

const answerFor = (
  question: (typeof MVP_ONBOARDING_QUESTIONS)[number]
): MvpOnboardingAnswerInput => {
  if (question.id === 'children_intent') {
    return {
      action: 'answer',
      questionId: question.id,
      questionRevision: question.revision,
      capturePolicy: 'PRIVATE',
      value: { kind: 'skipped' },
    };
  }
  const capturePolicy =
    question.id === 'planning_style' ? 'PAIR_MODEL_ONLY' : 'PRIVATE';
  if (question.kind === 'boolean') {
    return {
      action: 'answer',
      questionId: question.id,
      questionRevision: question.revision,
      capturePolicy,
      value: { kind: 'boolean', booleanValue: true },
    };
  }
  if (question.kind === 'multi') {
    const optionIds = (question.choices ?? [])
      .slice(0, question.minSelections ?? 1)
      .map((choice) => choice.id);
    return {
      action: 'answer',
      questionId: question.id,
      questionRevision: question.revision,
      capturePolicy,
      value: { kind: 'multi', optionIds },
    };
  }
  const optionId = question.choices?.[0]?.id;
  assert.ok(optionId, `Question ${question.id} must expose a choice`);
  return {
    action: 'answer',
    questionId: question.id,
    questionRevision: question.revision,
    capturePolicy,
    value: { kind: 'single', optionId },
  };
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    directConnection: true,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    await Promise.all([
      MvpOnboardingSession.createIndexes(),
      DefinitionRegistryRelease.createIndexes(),
      EvidenceEvent.createIndexes(),
      IndividualFactorSnapshot.createIndexes(),
    ]);

    await mvpOnboardingService.mutate({
      currentUserId: subjectId,
      mutation: {
        action: 'start',
        contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
        policyVersion: MVP_ONBOARDING_POLICY_VERSION,
        consent: {
          adultConfirmed: true,
          voluntaryParticipationConfirmed: true,
          privacyAcknowledged: true,
        },
      },
    });

    for (const question of MVP_ONBOARDING_QUESTIONS) {
      await mvpOnboardingService.mutate({
        currentUserId: subjectId,
        mutation: answerFor(question),
      });
    }

    const completed = await mvpOnboardingService.mutate({
      currentUserId: subjectId,
      mutation: { action: 'complete' },
    });
    assert.equal(completed.session?.status, 'completed');
    assert.equal(completed.session?.modelStatus, 'MATERIALIZED');

    const storedSession = await MvpOnboardingSession.findOne({
      userId: subjectId,
    }).lean();
    assert.equal(storedSession?.factorEngine.status, 'MATERIALIZED');
    assert.equal(storedSession?.factorEngine.evidenceEventIds.length, 3);
    assert.equal(storedSession?.factorEngine.individualSnapshotIds.length, 3);

    const evidence = await EvidenceEvent.find({ actorId: subjectId })
      .sort({ factorKey: 1 })
      .lean();
    assert.equal(evidence.length, 3);
    assert.ok(evidence.every((event) => event.status === 'ACCEPTED'));
    assert.ok(evidence.every((event) => event.context === 'SELF'));
    assert.ok(evidence.every((event) => event.subjectId === subjectId));
    assert.ok(evidence.every((event) => event.policyVersion === 'mvp-privacy-v1'));
    assert.ok(evidence.every((event) => event.retentionClass === 'OWNER_CONTROLLED'));
    assert.ok(evidence.every((event) => event.sourceHash.length === 64));
    assert.ok(evidence.every((event) => event.consentRevision.startsWith('consent:')));

    const repair = evidence.find(
      (event) => event.factorKey === 'communication.conflict.repairSkill'
    );
    assert.equal(repair?.captureMode, 'PRIVATE');
    assert.equal(repair?.purpose, 'OWNER_PROFILE');

    const planning = evidence.find(
      (event) => event.factorKey === 'sharedLife.planning.structurePreference'
    );
    assert.equal(planning?.captureMode, 'PAIR_MODEL_ONLY');
    assert.equal(planning?.purpose, 'PAIR_MODEL');

    const children = evidence.find(
      (event) => event.factorKey === 'lifePlans.family.childrenIntent'
    );
    assert.equal(children?.captureMode, 'PRIVATE');
    assert.equal(children?.purpose, 'OWNER_PROFILE');
    assert.equal(children?.status, 'ACCEPTED');
    assert.ok(children && children.status === 'ACCEPTED');
    assert.equal(children.normalizedValue.kind, 'UNKNOWN');
    if (children.normalizedValue.kind === 'UNKNOWN') {
      assert.equal(children.normalizedValue.reasonCode, 'NOT_ANSWERED');
    }

    const snapshots = await IndividualFactorSnapshot.find({
      subjectId,
    }).lean();
    assert.equal(snapshots.length, 3);
    assert.ok(snapshots.every((snapshot) => snapshot.contextPairId === undefined));
    assert.deepEqual(
      new Set(snapshots.map((snapshot) => snapshot.projectionPurpose)),
      new Set(['OWNER_PROFILE', 'PAIR_MODEL'])
    );

    const evidenceIds = evidence.map((event) => event.eventId).sort();
    const snapshotIds = snapshots.map((snapshot) => snapshot.snapshotId).sort();
    const retry = await mvpOnboardingService.mutate({
      currentUserId: subjectId,
      mutation: { action: 'complete' },
    });
    assert.equal(retry.session?.modelStatus, 'MATERIALIZED');
    assert.equal(await EvidenceEvent.countDocuments({ actorId: subjectId }), 3);
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({ subjectId }),
      3
    );
    const retriedSession = await MvpOnboardingSession.findOne({
      userId: subjectId,
    }).lean();
    assert.deepEqual(
      [...(retriedSession?.factorEngine.evidenceEventIds ?? [])].sort(),
      evidenceIds
    );
    assert.deepEqual(
      [...(retriedSession?.factorEngine.individualSnapshotIds ?? [])].sort(),
      snapshotIds
    );

    console.log('onboarding Factor Engine integration: ok');
  } finally {
    await Promise.all([
      MvpOnboardingSession.deleteMany({ userId: subjectId }),
      EvidenceEvent.deleteMany({ actorId: subjectId }),
      IndividualFactorSnapshot.deleteMany({ subjectId }),
    ]);
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'integration failed');
  process.exitCode = 1;
});
