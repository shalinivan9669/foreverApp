import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';
import { usersService } from '@/domain/services/users.service';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { mvpOnboardingService, MVP_ONBOARDING_QUESTIONS, MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION } from '@/domain/services/mvpOnboarding.service';
import { getOwnerFactorProfileSummary } from '@/domain/services/factorProfileSummary.service';
import { questionnairesService } from '@/domain/services/questionnaires.service';
import { developmentService } from '@/domain/services/development.service';
import { weeklyCheckInService } from '@/domain/services/weeklyCheckIn.service';
import { readActivityRecommendationInputs } from '@/domain/services/activityFactorRuntime.service';
import { toOwnerFactorProfileDTO, type ProfileSummaryDTO } from '@/lib/dto/factorProfile.dto';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair';
import { Questionnaire, QUESTIONNAIRE_CONTENT_MODEL } from '@/models/Questionnaire';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { DevelopmentCompletion } from '@/models/DevelopmentCompletion';

// This is an executable audit of present behavior, including explicit product
// gaps. Passing this audit is NOT certification that questionnaire scoring exists.
const target = requireMatchingTestDatabaseTarget();
const parsed = new URL(target.uri);
assert.equal(parsed.hostname, '127.0.0.1');
assert.ok(parsed.searchParams.get('replicaSet'));
process.env.MONGODB_URI = target.uri;
const runId = randomUUID();
const members: [string, string] = [`factor-profile-a-${runId}`, `factor-profile-b-${runId}`];
const pairOnlyPeer = `factor-profile-c-${runId}`;
let stage = 'setup';
let activePairId: string | undefined;
const report = (status: 'running' | 'passed' | 'failed') => process.stderr.write(`${JSON.stringify({ suite: 'factor-profile-flow', stage, status })}\n`);
const step = async (name: string, action: () => Promise<void>) => {
  stage = name;
  report('running');
  await action();
  report('passed');
};
const profile = async (id: string) => {
  const result = await getOwnerFactorProfileSummary(id);
  assert.ok(result);
  return result;
};
const presentation = (summary: ProfileSummaryDTO) => summary.factorProfile.cards.map((card) => ({
  key: card.factorKey, status: card.status, wording: card.neutralWording,
  confidence: card.confidence.band, freshness: card.freshness.band,
}));
const counts = async () => ({
  evidence: await EvidenceEvent.countDocuments({ actorId: { $in: members } }),
  individual: await IndividualFactorSnapshot.countDocuments({ subjectId: { $in: members } }),
  pair: activePairId ? await PairFactorEvaluationSnapshot.countDocuments({ pairId: activePairId }) : 0,
});

async function onboard(id: string, pairOnly: boolean): Promise<void> {
  await mvpOnboardingService.mutate({ currentUserId: id, mutation: {
    action: 'start', contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
    policyVersion: MVP_ONBOARDING_POLICY_VERSION,
    consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true },
  } });
  for (const question of MVP_ONBOARDING_QUESTIONS) {
    const choices = question.choices ?? [];
    const value = question.kind === 'boolean' ? { kind: 'boolean' as const, booleanValue: true }
      : question.kind === 'multi' ? { kind: 'multi' as const, optionIds: choices.slice(0, question.minSelections ?? 1).map((choice) => choice.id) }
        : { kind: 'single' as const, optionId: (pairOnly ? choices.at(-1) : choices[0])?.id };
    await mvpOnboardingService.mutate({ currentUserId: id, mutation: {
      action: 'answer', questionId: question.id, questionRevision: question.revision,
      capturePolicy: pairOnly ? 'PAIR_MODEL_ONLY' : 'PRIVATE', value,
    } });
  }
  await mvpOnboardingService.mutate({ currentUserId: id, mutation: { action: 'complete' } });
}

async function main(): Promise<void> {
  await mongoose.connect(target.uri);
  // The parent owns this new database and mongod. No existing environment is used.
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  for (const id of [...members, pairOnlyPeer]) {
    await usersService.upsertCurrentUserProfile({ currentUserId: id, payload: { username: 'Проверка факторов', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    await entryProfileService.save({ currentUserId: id, profile: { cohort: 'EXISTING_PARTNER', age: 30, gender: 'female', city: 'Тестовый город', locationMode: 'NONE' } });
  }
  await step('Private onboarding reaches owner profile', async () => {
    assert.ok((await profile(members[0])).factorProfile.cards.every((card) => card.status === 'MISSING'));
    await onboard(members[0], false);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: members[0] }), 3);
    const personal = await profile(members[0]);
    for (const key of ['communication.conflict.repairSkill', 'sharedLife.planning.structurePreference', 'lifePlans.family.childrenIntent']) {
      assert.equal(personal.factorProfile.cards.find((card) => card.factorKey === key)?.status,
        key === 'communication.conflict.repairSkill' ? 'INSUFFICIENT' : 'AVAILABLE');
    }
    const before = await counts();
    await mvpOnboardingService.mutate({ currentUserId: members[0], mutation: { action: 'complete' } });
    assert.deepEqual(await counts(), before);
  });
  await step('Confirmed pair only answers absent from owner profile', async () => {
    await onboard(members[1], true);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: members[1] }), 3);
    assert.ok((await profile(members[1])).factorProfile.cards.every((card) => card.status === 'MISSING'));
  });
  await step('Confirmed owner cards omit characteristic meaning', async () => {
    const stored = await IndividualFactorSnapshot.findOne({ subjectId: members[0], factorKey: 'sharedLife.planning.structurePreference' }).lean();
    assert.ok(stored);
    const source = { ...stored, metrics: { ...stored.metrics } };
    const opposite = { ...source, value: { kind: 'SCALAR' as const, scalarValue: 0.9 } };
    assert.notDeepEqual(source.value, opposite.value);
    assert.deepEqual(
      toOwnerFactorProfileDTO({ ownerId: members[0], snapshots: [source] }),
      toOwnerFactorProfileDTO({ ownerId: members[0], snapshots: [opposite] }),
    );
  });
  await step('Confirmed onboarding not projected into pair characteristics', async () => {
    await onboard(pairOnlyPeer, true);
    const modelMembers = [members[1], pairOnlyPeer];
    const modelPair = await Pair.create({ members: modelMembers, key: [...modelMembers].sort().join('|'), status: 'active' });
    const pairId = String(modelPair._id);
    assert.equal(await IndividualFactorSnapshot.countDocuments({ subjectId: { $in: modelMembers }, projectionPurpose: 'PAIR_MODEL', factorKey: 'sharedLife.planning.structurePreference' }), 2);
    await weeklyCheckInService.pairCurrent({ currentUserId: members[1], pairId });
    await readActivityRecommendationInputs({ pairId, effectiveAt: new Date() });
    assert.equal(await PairFactorEvaluationSnapshot.countDocuments({ pairId, factorKey: 'sharedLife.planning.structurePreference' }), 0);
    // Synthetic setup only: isolate the later weekly test from this former pair.
    await Pair.updateOne({ _id: modelPair._id }, { $set: { status: 'ended', endedAt: new Date() } });
  });
  const pair = await Pair.create({ members, key: [...members].sort().join('|'), status: 'active' });
  const pairId = String(pair._id);
  activePairId = pairId;
  const questionnaireIds = [`factor-personal-${runId}`, `factor-pair-${runId}`];
  await Questionnaire.create(questionnaireIds.map((id, index) => ({
    _id: id, contentModel: QUESTIONNAIRE_CONTENT_MODEL, publicationStatus: 'published',
    reviewedAt: new Date(), publishedAt: new Date(), title: { ru: 'Проверка механики' },
    description: { ru: 'Изолированная проверка' }, domainKey: 'communication', difficulty: 1,
    tags: [], version: 1, randomize: false,
    target: { type: index === 0 ? 'individual' : 'couple', gender: 'unisex' },
    questions: [{ id: 'q1', domainKey: 'communication', topicKey: 'conversation.directness', scale: 'likert5', optionCount: 5,
      text: { ru: 'Синтетический вопрос' }, scope: index === 0 ? 'pair_or_solo' : 'pair',
      audience: index === 0 ? 'personal' : 'couple', sensitivity: 'medium', locale: 'ru', contentRevision: 'audit-v1' }],
  })));
  await step('Confirmed personal questionnaire and retake produce no factors', async () => {
    const before = await counts();
    const ownerBefore = presentation(await profile(members[0]));
    for (const ui of [1, 5, 5]) await questionnairesService.submitBulkAnswers({ currentUserId: members[0], questionnaireId: questionnaireIds[0], answers: [{ qid: 'q1', ui }] });
    assert.equal(await PersonalQuestionnaireSubmission.countDocuments({ userId: members[0], semanticStatus: 'UNMAPPED' }), 2);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(presentation(await profile(members[0])), ownerBefore);
  });
  await step('Confirmed pair questionnaire completion produces no factors', async () => {
    const before = await counts();
    const started = await questionnairesService.startPairQuestionnaire({ currentUserId: members[0], pairId, questionnaireId: questionnaireIds[1] });
    for (const [index, id] of members.entries()) await questionnairesService.answerPairQuestionnaire({ currentUserId: id, pairId, questionnaireId: questionnaireIds[1], sessionId: started.sessionId, questionId: 'q1', ui: index === 0 ? 1 : 5 });
    assert.equal((await PairQuestionnaireSession.findById(started.sessionId).lean())?.status, 'completed');
    assert.deepEqual(await counts(), before);
  });
  await step('Confirmed development reflection produces progress only', async () => {
    const overview = await developmentService.overview(members[0]);
    const card = overview.content.find((item) => item.kind === 'REFLECTION' && !item.locked);
    assert.ok(card);
    const before = await counts();
    const detail = await developmentService.start(members[0], card.key);
    await developmentService.complete(members[0], { runId: detail.run.id, answers: detail.content.prompts.map((_, question) => ({ question, value: 1 })), feedback: 'HELPFUL', privateNote: '' });
    assert.equal(await DevelopmentCompletion.countDocuments({ userId: members[0], runId: detail.run.id }), 1);
    assert.deepEqual(await counts(), before);
  });
  await step('Weekly first answer stays partial second updates pair summary', async () => {
    const ownerBefore = presentation(await profile(members[0]));
    const answers = { closeness: 0.8, fatigue: 0.2, irritation: 0.1, readiness: 0.9, unresolvedTopic: false };
    await weeklyCheckInService.submit({ currentUserId: members[0], pairId, answers });
    const partial = await weeklyCheckInService.pairCurrent({ currentUserId: members[0], pairId });
    assert.equal(partial.pair.bothSubmitted, false);
    assert.equal(partial.pair.signals.length, 0);
    const first = await PairFactorEvaluationSnapshot.find({ pairId, factorKey: 'communication.weekly.connection' }).sort({ revision: -1 }).findOne().lean();
    await weeklyCheckInService.submit({ currentUserId: members[1], pairId, answers });
    const ready = await weeklyCheckInService.pairCurrent({ currentUserId: members[0], pairId });
    assert.equal(ready.pair.bothSubmitted, true);
    assert.equal(ready.pair.dataStatus, 'ENOUGH');
    assert.equal(ready.pair.signals.length, 4);
    const second = await PairFactorEvaluationSnapshot.find({ pairId, factorKey: 'communication.weekly.connection' }).sort({ revision: -1 }).findOne().lean();
    assert.equal(first, null);
    assert.ok(second);
    const beforeRetry = await EvidenceEvent.countDocuments({ pairId });
    await weeklyCheckInService.submit({ currentUserId: members[1], pairId, answers });
    assert.equal(await EvidenceEvent.countDocuments({ pairId }), beforeRetry);
    assert.deepEqual(presentation(await profile(members[0])), ownerBefore);
    for (const forbidden of ['normalizedValue', 'submittedValue', 'scalarValue', 'evidenceCount']) assert.equal(JSON.stringify(ready).includes(forbidden), false);
  });
  stage = 'Audit complete with five confirmed product gaps';
  report('passed');
}

// Cleanup is owned by local-acceptance: this script only runs in its new private
// replica set. Never drop a database or remove files from an independently run test.
void main().catch((error: Error) => {
  report('failed');
  const line = /factor-profile-flow\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1];
  stage = `Failure ${error.name.replace(/[^A-Za-z]/g, '')} at line ${line ?? 'unavailable'}`;
  report('failed');
  process.exitCode = 1;
}).finally(async () => {
  await User.deleteMany({ id: { $in: [...members, pairOnlyPeer] } });
  await mongoose.disconnect();
});
