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
import { measurementTestsService } from '@/domain/services/measurementTests.service';
import { MeasurementTestSession } from '@/models/MeasurementTestSession';
import { readMeasuredPairProfile } from '@/domain/services/measuredPairProfile.service';
import { MVP_FACTOR_REGISTRY, MVP_FACTOR_REGISTRY_V7 } from '@/domain/model/definitions/mvpDefinitions';
import { createEvidenceEvent } from '@/domain/model/evidence/evidence';
import { seedDefinitionRegistryRelease, upsertEvidenceEvent } from '@/domain/services/factorEnginePersistence.service';
import { fromStoredFactorValue } from '@/models/factorEngineSchemas';
import { productWorkspacePrivacy } from '@/domain/services/productWorkspacePrivacy.service';
import { loadMatchingActualProfileSources, saveMatchingProfile } from '@/domain/services/matching/matchingProfileRuntime.service';
import { buildMatchingActualProfile, evaluateMatching, validatePartnerPreferenceProfile } from '@/domain/model/matching/intelligence';
import { MatchingUseGrant } from '@/models/MatchingUseGrant';
import { MatchingProfile } from '@/models/MatchingProfile';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { MatchingFeedSession } from '@/models/MatchingFeedSession';

// Golden expectations below are literal, independently computed from the contract.
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
  await step('Pair permission preserves own results', async () => {
    await onboard(members[1], true);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: members[1] }), 3);
    assert.equal((await profile(members[1])).factorProfile.cards.find((card) => card.factorKey === 'sharedLife.planning.structurePreference')?.status, 'AVAILABLE');
  });
  await step('Owner cards explain opposite values differently', async () => {
    const stored = await IndividualFactorSnapshot.findOne({ subjectId: members[0], factorKey: 'sharedLife.planning.structurePreference' }).lean();
    assert.ok(stored);
    const source = { ...stored, metrics: { ...stored.metrics } };
    const opposite = { ...source, value: { kind: 'SCALAR' as const, scalarValue: 0.9 } };
    assert.notDeepEqual(source.value, opposite.value);
    assert.notDeepEqual(
      toOwnerFactorProfileDTO({ ownerId: members[0], snapshots: [source] }),
      toOwnerFactorProfileDTO({ ownerId: members[0], snapshots: [opposite] }),
    );
  });
  await step('Two onboarding profiles create applicable pair model', async () => {
    await onboard(pairOnlyPeer, true);
    const modelMembers = [members[1], pairOnlyPeer];
    const modelPair = await Pair.create({ members: modelMembers, key: [...modelMembers].sort().join('|'), status: 'active' });
    const pairId = String(modelPair._id);
    assert.equal(await IndividualFactorSnapshot.countDocuments({ subjectId: { $in: modelMembers }, projectionPurpose: 'PAIR_MODEL', factorKey: 'sharedLife.planning.structurePreference' }), 2);
    await weeklyCheckInService.pairCurrent({ currentUserId: members[1], pairId });
    await readActivityRecommendationInputs({ pairId, effectiveAt: new Date() });
    const summary = await readMeasuredPairProfile(members[1], pairId);
    assert.equal(summary.cards.find((card) => card.factorKey === 'sharedLife.planning.structurePreference')?.state, 'READY');
    assert.ok(await PairFactorEvaluationSnapshot.countDocuments({ pairId, factorKey: 'sharedLife.planning.structurePreference' }) > 0);
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
  await step('Unmapped reflection stays unmeasured and immutable', async () => {
    const before = await counts();
    const ownerBefore = presentation(await profile(members[0]));
    for (const ui of [1, 1]) await questionnairesService.submitBulkAnswers({ currentUserId: members[0], questionnaireId: questionnaireIds[0], answers: [{ qid: 'q1', ui }] });
    await assert.rejects(() => questionnairesService.submitBulkAnswers({ currentUserId: members[0], questionnaireId: questionnaireIds[0], answers: [{ qid: 'q1', ui: 5 }] }));
    assert.equal(await PersonalQuestionnaireSubmission.countDocuments({ userId: members[0], semanticStatus: 'UNMAPPED' }), 1);
    assert.deepEqual(await counts(), before);
    assert.deepEqual(presentation(await profile(members[0])), ownerBefore);
  });
  await step('Unmapped pair reflection does not fabricate measurements', async () => {
    const before = await counts();
    const started = await questionnairesService.startPairQuestionnaire({ currentUserId: members[0], pairId, questionnaireId: questionnaireIds[1] });
    for (const [index, id] of members.entries()) await questionnairesService.answerPairQuestionnaire({ currentUserId: id, pairId, questionnaireId: questionnaireIds[1], sessionId: started.sessionId, questionId: 'q1', ui: index === 0 ? 1 : 5 });
    assert.equal((await PairQuestionnaireSession.findById(started.sessionId).lean())?.status, 'completed');
    assert.deepEqual(await counts(), before);
  });
  await step('Library reflection remains honest self reflection', async () => {
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
    assert.notDeepEqual(presentation(await profile(members[0])), ownerBefore);
    for (const forbidden of ['normalizedValue', 'submittedValue', 'scalarValue', 'evidenceCount']) assert.equal(JSON.stringify(ready).includes(forbidden), false);
  });
  await measurementGoldenScenarios();
  await compatibilityScenarios();
  stage = 'Target measurement scenarios completed';
  report('passed');
}

async function measurementGoldenScenarios(): Promise<void> {
  const ids = [`golden-a-${runId}`, `golden-b-${runId}`] as const;
  const key = 'sharedLife.planning.structurePreference';
  const actual = async (id: string) => {
    const source = (await loadMatchingActualProfileSources({ ownerIds: [id] }))[0];
    return buildMatchingActualProfile({ ...source, release: MVP_FACTOR_REGISTRY, projectedAt: new Date() });
  };
  const preferences = (id: string) => validatePartnerPreferenceProfile({ ownerId: id, revision: 1, registryKey: MVP_FACTOR_REGISTRY.registryKey, registryVersion: MVP_FACTOR_REGISTRY.registryVersion, updatedAt: new Date(), release: MVP_FACTOR_REGISTRY, preferences: [{ factorKey: key, desiredValue: { kind: 'SCALAR_RANGE', minimum: 0.6, maximum: 1 }, importance: 'HIGH', flexibility: 'PREFER', constraintMode: 'NONE' }] });
  const evaluate = async () => evaluateMatching({ release: MVP_FACTOR_REGISTRY, requesterActualProfile: await actual(ids[0]), candidateActualProfile: await actual(ids[1]), requesterPreferences: preferences(ids[0]), candidatePreferences: preferences(ids[1]), calculatedAt: new Date() });
  await step('Empty profiles expose six meaningful test paths', async () => {
    for (const id of ids) {
      await usersService.upsertCurrentUserProfile({ currentUserId: id, payload: { username: 'Синтетический участник', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
      assert.ok((await profile(id)).factorProfile.cards.every((card) => card.status === 'MISSING'));
      const tests = await measurementTestsService.list(id);
      assert.equal(new Set(tests.map((row) => row.test.area)).size, 6);
      assert.ok(tests.every((row) => row.status === 'NEW'));
      await entryProfileService.save({ currentUserId: id, profile: { cohort: 'SOLO', age: 30, gender: 'female', city: 'Тестовый город', locationMode: 'NONE' } });
      await saveMatchingProfile({ ownerId: id, card: { requirements: ['Открытость', 'Уважение', 'Внимание'], give: ['Время', 'Забота', 'Поддержка'], questions: ['Как проходит день?', 'Что важно?', 'Как отдыхаете?'] }, actual: { relationshipIntent: 'LOOKING_FOR_LONG_TERM', childrenIntent: 'UNSURE' }, desiredAgeRange: { min: 25, max: 40 }, maxDistanceKm: 100, discoveryRequested: false, operationKey: randomUUID() });
      await MatchingUseGrant.create({ ownerId: id, factorKey: key, revision: 1, allowed: true, consentRevision: 'synthetic-explicit-permission', grantedAt: new Date() });
    }
    assert.equal((await evaluate()).factorResults.find((item) => item.factorKey === key)?.mutualFactorFit.status, 'UNAVAILABLE');
  });
  const beforeRevision = (await MatchingProfile.findOne({ userId: ids[0] }).lean())!.actualProfileRevision;
  await CandidatePresentationGrant.create({ tokenHash: 'a'.repeat(64), requesterId: ids[1], candidateId: ids[0], evaluationId: 'synthetic-before-measurement', requesterProfileRevision: beforeRevision, candidateProfileRevision: beforeRevision, requesterCardRevision: 1, candidateCardRevision: 1, requesterPreferenceRevision: 0, candidatePreferenceRevision: 0, registryVersion: MVP_FACTOR_REGISTRY.registryVersion, algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion, expiresAt: new Date(Date.now() + 60000) });
  await MatchingFeedSession.create({ tokenHash: 'b'.repeat(64), requesterId: ids[1], queryHash: 'c'.repeat(64), requesterProfileRevision: 1, requesterPreferenceRevision: 0, registryVersion: MVP_FACTOR_REGISTRY.registryVersion, algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion, candidateIds: [ids[0]], expiresAt: new Date(Date.now() + 60000) });
  for (const test of await measurementTestsService.list(ids[0])) {
    await step(`Golden area ${test.test.key}`, async () => {
      for (const [index, id] of ids.entries()) {
        const started = await measurementTestsService.mutate(id, test.test.key, { action: 'start' });
        const answers = started.test.questions.map((question) => ({ questionId: question.id, choice: index === 0 ? 1 : 3 }));
        const draft = await measurementTestsService.mutate(id, test.test.key, { action: 'draft', expectedRevision: started.revision, answers, pairUse: true });
        assert.equal(draft.status, 'DRAFT');
        assert.equal(await EvidenceEvent.countDocuments({ actorId: id, sourceRef: { $regex: '^measurement:' }, measurementKey: { $in: started.test.questions.map((question) => question.measurementKey) } }), 0);
        const result = await measurementTestsService.mutate(id, test.test.key, { action: 'finalize', expectedRevision: draft.revision, answers, pairUse: true });
        assert.equal(result.calculation, 'READY');
        const card = (await profile(id)).factorProfile.cards.find((card) => result.factorKeys.includes(card.factorKey))!;
        assert.equal(card.status, 'AVAILABLE');
        const expected = test.test.key === 'conversation' ? (index === 0 ? 0.25 : 0.85) : ['priorities', 'recovery'].includes(test.test.key) ? (index === 0 ? 0.2 : 0.8) : index === 0 ? -0.7 : 0.7;
        assert.ok(Math.abs(card.valuePresentation!.scale!.value - expected) < 0.00001);
        assert.ok(card.neutralWording.includes(card.valuePresentation!.label));
        const count = await EvidenceEvent.countDocuments({ actorId: id });
        const replay = await measurementTestsService.mutate(id, test.test.key, { action: 'finalize', expectedRevision: draft.revision, answers, pairUse: true });
        assert.equal(replay.finalizedAt, result.finalizedAt);
        assert.equal(await EvidenceEvent.countDocuments({ actorId: id }), count);
        await assert.rejects(() => measurementTestsService.mutate(id, test.test.key, { action: 'finalize', expectedRevision: 999, answers: answers.map((answer) => ({ ...answer, choice: 2 })), pairUse: true }));
        assert.equal((await measurementTestsService.mutate(id, test.test.key, { action: 'start' })).status, 'FINALIZED');
      }
    });
  }
  await step('Matching consumes expected values and revokes stale grants', async () => {
    const a = await actual(ids[0]);
    const b = await actual(ids[1]);
    assert.deepEqual(a.factors.find((factor) => factor.factorKey === key)?.value, { kind: 'SCALAR', value: -0.7 });
    assert.deepEqual(b.factors.find((factor) => factor.factorKey === key)?.value, { kind: 'SCALAR', value: 0.7 });
    const result = (await evaluate()).factorResults.find((factor) => factor.factorKey === key)!;
    assert.equal(result.mutualFactorFit.status, 'AVAILABLE');
    assert.equal(result.mutualFactorFit.fit, 0); // gap 1.4 exceeds the published maximum 1.2
    assert.ok(result.requesterExpectationFit.fit! > result.candidateExpectationFit.fit!);
    assert.ok((await CandidatePresentationGrant.findOne({ evaluationId: 'synthetic-before-measurement' }).lean())!.revokedAt);
    assert.equal(await MatchingFeedSession.countDocuments({ candidateIds: ids[0] }), 0);
    const stored = (await MatchingProfile.findOne({ userId: ids[0] }).lean())!;
    assert.ok(stored.actualProfileRevision > beforeRevision);
    assert.equal(stored.active, false);
    assert.equal(stored.discoveryRequested, false);
    assert.ok(a.factors.every((factor) => !factor.factorKey.startsWith('finance.') && !factor.factorKey.startsWith('intimacy.') && factor.factorKey !== 'wellbeing.current.overload'));
  });
  await step('Pair differences permissions pause and former contexts', async () => {
    const pair = await Pair.create({ members: ids, key: [...ids].sort().join('|'), status: 'active' });
    const pairId = String(pair._id);
    const summary = await readMeasuredPairProfile(ids[0], pairId);
    assert.equal(summary.cards.length, 6);
    assert.ok(summary.cards.every((card) => card.state === 'READY'));
    const snapshotCounts = {
      individual: await IndividualFactorSnapshot.countDocuments({ subjectId: { $in: ids } }),
      pair: await PairFactorEvaluationSnapshot.countDocuments({ pairId }),
    };
    const simultaneousReads = await Promise.all(ids.map((id) => readMeasuredPairProfile(id, pairId)));
    assert.deepEqual(simultaneousReads[0], simultaneousReads[1]);
    assert.equal(await IndividualFactorSnapshot.countDocuments({ subjectId: { $in: ids } }), snapshotCounts.individual);
    assert.equal(await PairFactorEvaluationSnapshot.countDocuments({ pairId }), snapshotCounts.pair);
    assert.equal(summary.cards.find((card) => card.factorKey === key)?.state, 'READY');
    const evaluation = await PairFactorEvaluationSnapshot.findOne({ pairId, factorKey: key }).sort({ revision: -1 }).lean();
    assert.equal(evaluation?.evaluation.status, 'TENSION');
    assert.ok(!JSON.stringify(summary).includes('scalarValue'));
    const ownBefore = (await profile(ids[0])).factorProfile.cards.find((card) => card.factorKey === key)!.valuePresentation;
    await measurementTestsService.mutate(ids[0], 'planning', { action: 'permission', pairUse: false, expectedPermissionRevision: 0 });
    assert.equal((await readMeasuredPairProfile(ids[1], pairId)).cards.find((card) => card.factorKey === key)?.state, 'WAITING');
    assert.deepEqual((await profile(ids[0])).factorProfile.cards.find((card) => card.factorKey === key)!.valuePresentation, ownBefore);
    await Pair.updateOne({ _id: pair._id }, { $set: { status: 'paused' } });
    assert.equal((await readMeasuredPairProfile(ids[0], pairId)).status, 'paused');
    await Pair.updateOne({ _id: pair._id }, { $set: { status: 'ended' } });
    await assert.rejects(() => readMeasuredPairProfile(ids[0], pairId));
    assert.equal((await measurementTestsService.get(ids[0], 'planning')).status, 'FINALIZED');
    const replacement = await Pair.create({ members: [ids[0], pairOnlyPeer], key: [ids[0], pairOnlyPeer].sort().join('|'), status: 'active' });
    const replacementSummary = await readMeasuredPairProfile(ids[0], String(replacement._id));
    assert.equal(replacementSummary.cards.find((card) => card.factorKey === 'intimacy.agreements.advanceDiscussion')?.state, 'WAITING');
    const exported = await productWorkspacePrivacy.exportOwnerData(ids[0]);
    assert.equal(exported.measurementTests.length, 6);
    assert.ok(exported.measurementTests.every((row) => row.answers.every((answer) => answer.choice === 1)));
    assert.ok(!JSON.stringify(exported).includes(ids[1]));
  });
  await step('Skips concurrent finalization and crash recovery', async () => {
    const id = `golden-recovery-${runId}`;
    await usersService.upsertCurrentUserProfile({ currentUserId: id, payload: { username: 'Проверка восстановления', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    const started = await measurementTestsService.mutate(id, 'conversation', { action: 'start' });
    const answers = started.test.questions.map((question) => ({ questionId: question.id, choice: null }));
    await assert.rejects(() => measurementTestsService.mutate(id, 'conversation', { action: 'finalize', expectedRevision: 0, answers, pairUse: false }, { afterSourceCommitted: async () => { throw new Error('SYNTHETIC_CRASH'); } }));
    const row = await MeasurementTestSession.findOne({ ownerId: id, testKey: 'conversation' }).lean();
    assert.equal(row?.status, 'FINALIZED'); assert.equal(row?.materializedRevision, -1);
    const recovered = await measurementTestsService.get(id, 'conversation');
    assert.equal(recovered.calculation, 'READY');
    assert.equal((await profile(id)).factorProfile.cards.find((card) => card.factorKey === 'communication.conflict.repairSkill')?.status, 'UNKNOWN');
    await measurementTestsService.mutate(id, 'planning', { action: 'start' });
    const results = await Promise.allSettled([1, 3].map((choice) => measurementTestsService.mutate(id, 'planning', { action: 'finalize', expectedRevision: 0, answers: [{ questionId: 'time', choice }], pairUse: false })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await MeasurementTestSession.countDocuments({ ownerId: id, testKey: 'planning' }), 1);
    const winner = await measurementTestsService.get(id, 'planning');
    const version = winner.test.revision;
    const persisted = await MeasurementTestSession.findOne({ ownerId: id, testKey: 'planning' }).lean();
    assert.equal(persisted?.contentRevision, version);
    assert.equal(winner.answers[0].choice === 1 || winner.answers[0].choice === 3, true);
  });
}

async function compatibilityScenarios(): Promise<void> {
  await step('Pinned publications replay and unavailable versions stay closed', async () => {
    const id = `publication-${runId}`;
    await usersService.upsertCurrentUserProfile({ currentUserId: id, payload: { username: 'Редакции', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    assert.equal((await measurementTestsService.mutate(id, 'planning', { action: 'start' })).test.revision, 2);
    // Model a previously persisted v1 draft; the published repository is unchanged.
    await MeasurementTestSession.collection.updateOne({ ownerId: id, testKey: 'planning' }, { $set: { contentRevision: 1 } });
    const final = await measurementTestsService.mutate(id, 'planning', { action: 'finalize', expectedRevision: 0, answers: [{ questionId: 'time', choice: 3 }], pairUse: false });
    assert.equal(final.test.revision, 1);
    assert.equal((await measurementTestsService.mutate(id, 'planning', { action: 'start' })).test.revision, 1);
    await MeasurementTestSession.collection.updateOne({ ownerId: id, testKey: 'planning' }, { $set: { contentRevision: 999 } });
    await assert.rejects(() => measurementTestsService.get(id, 'planning'), /Сохранённая редакция недоступна/);
    assert.equal(await MeasurementTestSession.countDocuments({ ownerId: id, status: 'FINALIZED' }), 1);
    await MeasurementTestSession.collection.updateOne({ ownerId: id, testKey: 'planning' }, { $set: { contentRevision: 1 } });
    assert.equal((await measurementTestsService.get(id, 'planning')).calculation, 'READY');
  });
  await step('Compatible old sources keep value and idempotent provenance', async () => {
    const id = `compatibility-${runId}`;
    await usersService.upsertCurrentUserProfile({ currentUserId: id, payload: { username: 'Совместимость', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    const old = MVP_FACTOR_REGISTRY_V7;
    const factor = old.factors.find((item) => item.key === 'sharedLife.planning.structurePreference')!;
    const measurement = old.measurements.find((item) => item.key === 'matching.structurePreference.direct')!;
    const instrument = old.instruments.find((item) => item.key === 'matching.profile.mvp')!;
    const at = new Date();
    const event = createEvidenceEvent({ eventId: `old-${runId}`, idempotencyKey: `old-${runId}`, actorId: id, subjectId: id, subjectKind: 'INDIVIDUAL', observationScope: 'SELF', factorKey: factor.key, measurementKey: measurement.key, instrumentKey: instrument.key, sourceType: measurement.sourceType, sourceRef: `old-profile:${id}`, sourceRevision: '1', submittedValue: { kind: 'SCALAR', value: -0.7 }, reliabilityMultiplier: 1, observedAt: at, recordedAt: at, context: 'DATING', purpose: 'MATCHING', privacyClass: factor.privacyClass, captureMode: 'PAIR_MODEL_ONLY', policyVersion: 'matching-profile-v1', consentRevision: 'old-explicit-source', retentionClass: 'OWNER_CONTROLLED', registryVersion: 7, algorithmVersion: 5 }, factor, measurement, instrument);
    assert.equal(event.status, 'ACCEPTED');
    await seedDefinitionRegistryRelease(old, at);
    await upsertEvidenceEvent(event, old);
    const summary = await profile(id);
    assert.equal(summary.factorProfile.cards.find((card) => card.factorKey === factor.key)?.valuePresentation?.scale?.value, -0.7);
    const bridge = await EvidenceEvent.findOne({ actorId: id, 'versions.registryVersion': 8 }).lean();
    assert.ok(bridge?.normalizedValue);
    assert.deepEqual(fromStoredFactorValue(bridge.normalizedValue), { kind: 'SCALAR', value: -0.7 });
    assert.equal(bridge.sourceHash, event.sourceHash);
    assert.equal(bridge.observedAt.toISOString(), at.toISOString());
    assert.equal(await EvidenceEvent.countDocuments({ actorId: id }), 2);
    await profile(id);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: id }), 2);
    const sources = (await loadMatchingActualProfileSources({ ownerIds: [id] }))[0];
    assert.ok(sources.snapshots.length > 0);
    assert.equal(sources.grants.length, 0);
  });
}

// Cleanup is owned by local-acceptance: this script only runs in its new private
// replica set. Never drop a database or remove files from an independently run test.
void main().catch((error: Error) => {
  report('failed');
  for (const match of (error.stack ?? '').matchAll(/([A-Za-z][A-Za-z0-9.]+\.ts):(\d+):\d+/g)) {
    process.stderr.write(`${JSON.stringify({ suite: 'factor-profile-flow', stage: `Trace ${match[1].replaceAll('.', ' ')} line ${match[2]}`, status: 'failed' })}\n`);
  }
  const line = /factor-profile-flow\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1];
  stage = `Failure ${error.name.replace(/[^A-Za-z]/g, '')} at line ${line ?? 'unavailable'}`;
  report('failed');
  process.exitCode = 1;
}).finally(async () => {
  await User.deleteMany({ id: { $in: [...members, pairOnlyPeer] } });
  await mongoose.disconnect();
});
