import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { GET as comparisonGet, POST as comparisonPost } from '@/app/api/assessments/comparison/route';
import { GET as assessmentGet, POST as assessmentPost } from '@/app/api/assessments/dom-s07/route';
import { DOM_S07_PUBLICATION } from '@/domain/assessment/publication';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import { DomainError } from '@/domain/errors';
import { assessmentComparisonService, resolveAssessmentSourceReference } from '@/domain/services/assessmentComparison.service';
import { assessmentTransaction } from '@/domain/services/assessmentAccess.service';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentComparisonDTO, AssessmentComparisonMutation } from '@/lib/dto/assessmentComparison.dto';
import { AssessmentComparison } from '@/models/AssessmentComparison';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { AssessmentRun } from '@/models/AssessmentRun';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { Pair } from '@/models/Pair';
import { createLocalAcceptanceFixtures } from './lib/local-acceptance-fixtures';
import { requireMatchingTestDatabaseTarget } from './lib/matching-test-database';
import { runAssessmentPairIntegration } from './assessment-pair.integration';
import type { WithoutAssessmentIntent } from './lib/assessment-test-intent';

// The existing local harness owns the entire replica set. Real onboarding,
// signed sessions, permissions and invite lifecycle supply the two actors.
const target = requireMatchingTestDatabaseTarget();
const uri = new URL(target.uri);
const runId = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(uri.pathname)?.[1];
assert.ok(runId);
assert.equal(uri.protocol, 'mongodb:');
assert.equal(uri.hostname, '127.0.0.1');
assert.equal(uri.username, '');
assert.equal(uri.password, '');
assert.equal(uri.searchParams.get('replicaSet'), `vmesteLocal${runId}`);
assert.equal(process.env.MONGODB_URI, target.uri);
assert.equal(process.env.ASSESSMENT_SYNTHETIC_ENABLED, 'true');
type Actor = 'a' | 'b';
type Fixtures = Awaited<ReturnType<typeof createLocalAcceptanceFixtures>>;
type OwnerComparisonMutation = WithoutAssessmentIntent<AssessmentComparisonMutation>;
type OwnerRunMutation = WithoutAssessmentIntent<AssessmentMutation>;
const comparisonTokens = new Map<Actor, string>();
const runTokens = new Map<Actor, string>();
let fixtures: Fixtures;
let stage = 'setup';
const completedIds = new Set<string>();
const key = () => randomUUID();
const origin = 'http://localhost:3106';
const report = (status: 'running' | 'passed' | 'failed') => process.stdout.write(`${JSON.stringify({ suite: 'assessment-comparison', stage, status, completedCases: completedIds.size })}\n`);
async function step(ids: string[], label: string, work: () => Promise<void>): Promise<void> {
  stage = `${ids.join(' ')} ${label}`.slice(0, 80);
  report('running');
  await work();
  ids.forEach(id => completedIds.add(id));
  report('passed');
}
const request = (actor: Actor | null, path: string, payload?: object, query = '') => new NextRequest(`${origin}/api/assessments/${path}${query}`, {
  method: payload ? 'POST' : 'GET',
  headers: { ...(actor ? { cookie: fixtures.sessionCookie(actor).split(';')[0] } : {}), ...(payload ? { 'content-type': 'application/json', origin } : {}) },
  ...(payload ? { body: JSON.stringify({ ...(path === 'comparison' ? { intentToken: actor ? comparisonTokens.get(actor) : undefined } : { viewerToken: actor ? runTokens.get(actor) : undefined }), ...payload }) } : {}),
});
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!body.ok) throw new Error(`COMPARISON_HTTP_${response.status}_${body.error.code}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return body.data;
}
const read = async (actor: Actor = 'a') => {
  const dto = await comparisonGet(request(actor, 'comparison')).then(unwrap<AssessmentComparisonDTO>);
  comparisonTokens.set(actor, dto.intentToken);
  return dto;
};
const mutate = async (actor: Actor, mutation: OwnerComparisonMutation) => {
  if (!comparisonTokens.has(actor)) await read(actor);
  const dto = await comparisonPost(request(actor, 'comparison', mutation)).then(unwrap<AssessmentComparisonDTO>);
  comparisonTokens.set(actor, dto.intentToken);
  return dto;
};
const readRun = async (actor: Actor) => {
  const dto = await assessmentGet(request(actor, 'dom-s07')).then(unwrap<AssessmentRunDTO>);
  runTokens.set(actor, dto.viewerToken);
  return dto;
};
const mutateRun = async (actor: Actor, mutation: OwnerRunMutation) => {
  if (!runTokens.has(actor)) await readRun(actor);
  const dto = await assessmentPost(request(actor, 'dom-s07', mutation)).then(unwrap<AssessmentRunDTO>);
  runTokens.set(actor, dto.viewerToken);
  return dto;
};
const mutateComparisonService = async (actor: Actor, mutation: OwnerComparisonMutation, hooks?: Parameters<typeof assessmentComparisonService.mutate>[2]) => {
  if (!comparisonTokens.has(actor)) await read(actor);
  return assessmentComparisonService.mutate(fixtures.subjects[actor], { ...mutation, intentToken: comparisonTokens.get(actor)! }, hooks);
};
const current = (actor: Actor = 'a') => mutate(actor, { action: 'calculate-current', idempotencyKey: key() });
async function denied(actor: Actor | null, payload: object | undefined, status: number): Promise<void> {
  const response = payload ? await comparisonPost(request(actor, 'comparison', payload)) : await comparisonGet(request(actor, 'comparison'));
  assert.equal(response.status, status);
  const result = await response.json() as ApiErrorEnvelope;
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(fixtures.subjects.b));
}
const answers: AssessmentDirectAnswers = {
  parenthood: 'WANT_CHILDREN', relationshipFormat: 'EXCLUSIVE',
  offersShopping: true, offersCooking: true,
  acceptableMeetingSlots: ['WEEKDAY_EVENING'], proposedMeetingSlots: ['WEEKEND_MORNING'],
  capacityMinutes: 300, ordinaryTaskMinutes: 180, practiceBudgetMinutes: 90, scheduleBudgetMinutes: 15,
  willingPractice: true, willingSchedule: true,
};
async function save(actor: Actor, patch: Partial<AssessmentDirectAnswers> = {}): Promise<AssessmentComparisonDTO> {
  const previous = await read(actor);
  return mutate(actor, { action: 'save-direct', expectedRevision: previous.direct.revision, idempotencyKey: key(), answers: { ...answers, ...patch }, useForComparison: true });
}
async function scenario(ids: Array<'A_demonstrates_full_cycle' | 'B_demonstrates_full_cycle' | 'joint_schedule'>, actor: Actor = 'a') {
  const before = await read(actor);
  assert.ok(before.current);
  const after = await mutate(actor, { action: 'scenario', expectedComparisonRevision: before.current.revision, idempotencyKey: key(), actionIds: ids });
  assert.deepEqual(after.current, before.current);
  const result = after.scenarios.at(-1);
  assert.ok(result);
  assert.equal(result.kind, 'HYPOTHETICAL');
  assert.equal(result.changesCurrentScore, false);
  assert.equal(result.baseRevision, before.current.revision);
  return result;
}
async function answerItem(actor: Actor, itemId: string, response: AssessmentResponse): Promise<void> {
  const before = await readRun(actor);
  const issued = await mutateRun(actor, { action: 'present', itemId, expectedRevision: before.revision, idempotencyKey: key() });
  assert.ok(issued.presentation);
  await mutateRun(actor, { action: 'answer', presentationId: issued.presentation.presentationId, expectedRevision: issued.revision, idempotencyKey: key(), response });
}
async function prepareSource(actor: Actor, fullCycle: boolean): Promise<void> {
  await mutateRun(actor, { action: 'start', idempotencyKey: key() });
  for (const item of DOM_S07_PUBLICATION.items) {
    const response: AssessmentResponse = item.kind === 'FACTS' ? {
      kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id,
        field.id.startsWith('NEG.') ? field.id.endsWith('.eligible')
          : fullCycle || ['taskNoticed', 'agreedPartOrganised'].includes(field.id),
      ])),
    } : { kind: 'OPTION', optionId: item.options[0].id };
    await answerItem(actor, item.id, response);
  }
  const before = await readRun(actor);
  const completed = await mutateRun(actor, { action: 'finalize', expectedRevision: before.revision, idempotencyKey: key() });
  assert.equal(completed.calculation, 'READY');
  const skill = completed.profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07');
  assert.ok(skill);
  assert.equal(skill.A.exactLevel, fullCycle ? 3 : 1);
  await mutateRun(actor, { action: 'matching-permission', matchingUse: true, expectedRevision: completed.revision, idempotencyKey: key() });
}
const ownSources = () => AssessmentRun.find({ ownerId: { $in: Object.values(fixtures.subjects) } }).sort({ ownerId: 1 }).lean();

async function main(): Promise<void> {
  const info = console.info;
  console.info = () => undefined;
  try { fixtures = await createLocalAcceptanceFixtures(runId!, 'assessment'); }
  finally { console.info = info; }
  assert.ok(fixtures.assessmentPairId);

  await step(['INT-033', 'INT-037'], 'Real source profile to current and scenario', async () => {
    await denied(null, undefined, 401);
    await prepareSource('a', true);
    await prepareSource('b', false);
    const intentA = await read('a');
    const intentB = await read('b');
    assert.equal(intentA.direct.revision, intentB.direct.revision);
    await denied('b', { action: 'save-direct', expectedRevision: intentB.direct.revision, idempotencyKey: key(), answers, useForComparison: true, intentToken: intentA.intentToken }, 409);
    assert.equal(await AssessmentDirect.countDocuments({ ownerId: { $in: Object.values(fixtures.subjects) } }), 0);
    await save('a');
    assert.equal((await read()).availability, 'UNAVAILABLE');
    await save('b');
    const now = await current();
    assert.equal(now.availability, 'AVAILABLE');
    assert.equal(now.context?.pairId, fixtures.assessmentPairId);
    assert.equal(now.context?.myRole, 'A');
    assert.ok(now.current);
    assert.equal(now.current.directions.A_FROM_B, 'NOT_SUPPORTED');
    assert.equal(now.current.directions.B_FROM_A, 'SUPPORTED');
    assert.deepEqual(now.current.barriers, ['HOUSEHOLD_ROLES']);
    const conditional = await scenario(['B_demonstrates_full_cycle']);
    assert.equal(conditional.status, 'TARGET_SUPPORTED');
    assert.ok(conditional.assumptions.length && conditional.verification.length);
    assert.equal(conditional.voluntaryState, 'DECLARED_OPEN_NOT_AGREED');
    assert.equal((await readRun('b')).profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07')?.A.exactLevel, 1);
  });

  await step(['INT-035'], 'Competence does not invent an offer', async () => {
    await save('a', { offersCooking: false });
    const now = await current();
    assert.equal(now.current?.directions.B_FROM_A, 'NOT_SUPPORTED');
    assert.notEqual((await scenario(['B_demonstrates_full_cycle'])).status, 'TARGET_SUPPORTED');
    assert.ok(!now.current?.availableActions.some(action => action.id === 'A_demonstrates_full_cycle'));
    await save('a');
  });

  await step(['INT-038'], 'Two barriers require a joint scenario', async () => {
    await save('b', { acceptableMeetingSlots: ['WEEKEND_EVENING'] });
    const now = await current();
    assert.deepEqual(now.current?.barriers, ['HOUSEHOLD_ROLES', 'TIME']);
    assert.notEqual((await scenario(['B_demonstrates_full_cycle'])).status, 'TARGET_SUPPORTED');
    assert.notEqual((await scenario(['joint_schedule'])).status, 'TARGET_SUPPORTED');
    assert.equal((await scenario(['B_demonstrates_full_cycle', 'joint_schedule'])).status, 'TARGET_SUPPORTED');
    await save('b');
  });

  await step(['INT-039'], 'Opposite parenthood remains an immutable barrier', async () => {
    await save('b', { parenthood: 'DO_NOT_WANT_CHILDREN' });
    const now = await current();
    assert.ok(now.current?.barriers.includes('PARENTHOOD'));
    assert.notEqual((await scenario(['B_demonstrates_full_cycle', 'joint_schedule'])).status, 'TARGET_SUPPORTED');
    assert.equal((await read('b')).direct.answers?.parenthood, 'DO_NOT_WANT_CHILDREN');
    await save('b');
  });

  await step(['INT-040'], 'Own 28 day budgets include ordinary tasks and attempt', async () => {
    await save('b', { capacityMinutes: 240 });
    await current('b');
    const insufficient = await scenario(['B_demonstrates_full_cycle'], 'b');
    assert.notEqual(insufficient.status, 'TARGET_SUPPORTED');
    assert.equal(insufficient.ownResources.ordinaryUse, 180);
    assert.equal(insufficient.ownResources.attemptUse, 90);
    assert.equal(insufficient.ownResources.capacity, 240);
    assert.equal(insufficient.ownResources.unit, 'minute');
    await save('b', { capacityMinutes: 300 });
    await current('b');
    const sufficient = await scenario(['B_demonstrates_full_cycle'], 'b');
    assert.equal(sufficient.status, 'TARGET_SUPPORTED');
    assert.equal(sufficient.ownResources.capacity, 300);
    assert.ok(sufficient.verification.some(text => /без обещания|не.*срок|бюджет/i.test(text)));
  });

  await step(['INT-041', 'INT-049'], 'Only published actions and safe owner DTO', async () => {
    const now = await current();
    const base = { action: 'scenario', expectedComparisonRevision: now.current!.revision, idempotencyKey: key(), actionIds: ['B_demonstrates_full_cycle'] };
    for (const forbidden of [
      { actionIds: ['override_safety'] }, { effects: { sameParenthood: 'T' } }, { ownerId: fixtures.subjects.b },
      { actorId: fixtures.subjects.b }, { peerId: fixtures.subjects.b }, { limits: { maxChecks: 2 } },
      { mode: 'PAIR' }, { audience: 'PAIR_MEMBERS' }, { actionIds: ['A_demonstrates_full_cycle'] },
    ]) await denied('a', { ...base, ...forbidden }, 400);
    const queried = await comparisonGet(request('a', 'comparison', undefined, `?ownerId=${fixtures.subjects.b}&peerId=another-user`)).then(unwrap<AssessmentComparisonDTO>);
    assert.deepEqual(queried, await read('a'));
    const json = JSON.stringify(queried);
    for (const privateKey of ['consumedInputHash', 'actorBindings', 'unknownInputIds', 'factDefinitions', 'requirementStatus', 'certificate', fixtures.subjects.b]) assert.ok(!json.includes(privateKey));
  });

  await step(['INT-042'], 'Refusal excluded unknown willingness remains unchosen', async () => {
    await save('b', { willingPractice: false });
    const declined = await current();
    assert.ok(!declined.current?.availableActions.some(action => action.id === 'B_demonstrates_full_cycle'));
    await denied('a', { action: 'scenario', expectedComparisonRevision: declined.current!.revision, idempotencyKey: key(), actionIds: ['B_demonstrates_full_cycle'] }, 400);
    await save('b', { willingPractice: null });
    await current();
    assert.equal((await scenario(['B_demonstrates_full_cycle'])).voluntaryState, 'MODEL_OPTION_NOT_CHOSEN');
    await save('b');
  });

  await step(['INT-044'], 'Exhausted search retains explicit completeness', async () => {
    const budget = await mutateComparisonService('a', { action: 'calculate-current', idempotencyKey: key() }, { limits: { maxChecks: 1 } });
    assert.equal(budget.current?.status, 'INCOMPLETE');
    assert.equal(budget.current?.completeness, 'BUDGET_EXCEEDED');
    assert.equal(budget.current?.limits.maxChecks, 1);
    await save('b', { acceptableMeetingSlots: ['WEEKEND_EVENING'] });
    const before = await current();
    const searched = await mutateComparisonService('a', {
      action: 'scenario', expectedComparisonRevision: before.current!.revision, idempotencyKey: key(), actionIds: ['B_demonstrates_full_cycle', 'joint_schedule'],
    }, { limits: { maxActionSets: 1, maxActionsPerSet: 1 } });
    const incomplete = searched.scenarios.at(-1);
    assert.equal(incomplete?.status, 'INCOMPLETE');
    assert.equal(incomplete?.completeness, 'BUDGET_EXCEEDED');
    assert.equal(incomplete?.limits.maxActionSets, 1);
    assert.deepEqual(incomplete?.searchActionIds, ['B_demonstrates_full_cycle', 'joint_schedule']);
    assert.deepEqual(searched.current, before.current);
    const limitedDomain = await mutateComparisonService('a', {
      action: 'scenario', expectedComparisonRevision: before.current!.revision, idempotencyKey: key(), actionIds: ['B_demonstrates_full_cycle', 'joint_schedule'],
    }, { limits: { maxActionsPerSet: 1 } });
    assert.equal(limitedDomain.scenarios.at(-1)?.status, 'NO_TARGET_PLAN_IN_CATALOG');
    assert.equal(limitedDomain.scenarios.at(-1)?.completeness, 'COMPLETE_WITHIN_LIMITS');
    assert.equal(limitedDomain.scenarios.at(-1)?.limits.maxActionsPerSet, 1);
    await save('b');
    await current();
  });

  await step(['INT-045', 'INT-050'], 'Hypothesis has no source reward or feed effects', async () => {
    const sourcesBefore = await ownSources();
    const evidenceBefore = await EvidenceEvent.countDocuments({ actorId: { $in: Object.values(fixtures.subjects) } });
    const progressBefore = (await Pair.findById(fixtures.assessmentPairId).lean())?.progress;
    const isolatedCollections = ['matching_profiles', 'candidate_discovery_projections', 'matching_feed_sessions', 'likes', 'matching_connections', 'development_runs'];
    const db = mongoose.connection.db!;
    const countsBefore = await Promise.all(isolatedCollections.map(name => db.collection(name).countDocuments()));
    const before = await current();
    await scenario(['B_demonstrates_full_cycle']);
    assert.deepEqual((await read()).current, before.current);
    assert.deepEqual(await ownSources(), sourcesBefore);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: { $in: Object.values(fixtures.subjects) } }), evidenceBefore);
    assert.deepEqual((await Pair.findById(fixtures.assessmentPairId).lean())?.progress, progressBefore);
    assert.deepEqual(await Promise.all(isolatedCollections.map(name => db.collection(name).countDocuments())), countsBefore);
    process.env.ASSESSMENT_MODE = 'OFF';
    try {
      await denied('a', { action: 'calculate-current', idempotencyKey: key() }, 404);
      const controls = await comparisonGet(request('a', 'comparison', undefined, '?view=controls')).then(unwrap<AssessmentComparisonDTO>);
      assert.equal(controls.intentToken, comparisonTokens.get('a'));
      assert.equal(controls.current, null);
      assert.deepEqual(controls.scenarios, []);
    }
    finally { delete process.env.ASSESSMENT_MODE; }
    assert.deepEqual(await Promise.all(isolatedCollections.map(name => db.collection(name).countDocuments())), countsBefore);
  });

  await step(['INT-046'], 'Internal cache envelope rejects scope and stale bindings', async () => {
    const attacks: object[] = [
      { 'envelope.mode': 'PAIR' }, { 'envelope.purpose': 'PAIR_MODEL' }, { 'envelope.audience': 'PAIR_MEMBERS' },
      { 'envelope.viewerId': fixtures.subjects.b }, { 'envelope.actorBindings.A': fixtures.subjects.b },
      { 'envelope.relationshipRef': 'different-pair' }, { 'envelope.contentHash': 'tampered' }, { 'envelope.consumedInputHash': 'tampered' },
      { 'envelope.selectedPublishedActionIds': ['joint_schedule'] },
      { 'envelope.searchLimits.maxChecks': 0 }, { envelope: null },
      ...(['A', 'B'] as const).flatMap(actor => [
        { [`envelope.participants.${actor}.sourceRevision`]: 999 },
        { [`envelope.participants.${actor}.permissionRevision`]: 999 },
        { [`envelope.participants.${actor}.directRevision`]: 999 },
        { [`envelope.participants.${actor}.directPermissionRevision`]: 999 },
        { [`envelope.participants.${actor}.directDeletionGeneration`]: 999 },
        { [`envelope.participants.${actor}.deletionGeneration`]: 999 },
        { [`envelope.participants.${actor}.accountGeneration`]: 'obsolete' },
      ]),
    ];
    for (const attack of attacks) {
      await current();
      await AssessmentComparison.updateOne({ ownerId: fixtures.subjects.a }, { $set: attack });
      const stale = await read();
      assert.equal(stale.current, null);
      assert.deepEqual(stale.scenarios, []);
    }
    await current();
    await assert.rejects(mutateComparisonService('a', { action: 'calculate-current', idempotencyKey: key() }, {
      afterComputed: async () => { await save('b', { capacityMinutes: 299 }); },
    }), (error: Error) => error instanceof DomainError && error.status === 409);
    assert.equal((await read()).current, null);
    await save('b');
    await current();
    await assert.rejects(mutateComparisonService('a', { action: 'calculate-current', idempotencyKey: key() }, {
      afterComputed: async () => {
        const source = await readRun('b');
        await mutateRun('b', { action: 'matching-permission', matchingUse: false, expectedRevision: source.revision, idempotencyKey: key() });
      },
    }), (error: Error) => error instanceof DomainError && error.status === 409);
    assert.equal((await read()).availability, 'UNAVAILABLE');
    const latest = await readRun('b');
    await mutateRun('b', { action: 'matching-permission', matchingUse: true, expectedRevision: latest.revision, idempotencyKey: key() });
    await current();
    await assert.rejects(mutateComparisonService('a', { action: 'calculate-current', idempotencyKey: key() }, {
      afterComputed: async () => {
        const source = await readRun('b');
        await mutateRun('b', { action: 'revise', expectedRevision: source.revision, idempotencyKey: key() });
      },
    }), (error: Error) => error instanceof DomainError && error.status === 409);
    assert.equal((await read()).availability, 'UNAVAILABLE');
    const draft = await readRun('b');
    await mutateRun('b', { action: 'finalize', expectedRevision: draft.revision, idempotencyKey: key() });
  });

  await step(['INT-047', 'INT-048'], 'Revocation and hidden peer edits are noninterfering', async () => {
    await current();
    const sourceA = await AssessmentRun.findOne({ ownerId: fixtures.subjects.a }).lean();
    const sourceB = await AssessmentRun.findOne({ ownerId: fixtures.subjects.b }).lean();
    assert.ok(sourceA && sourceB);
    await assessmentTransaction(async session => {
      assert.ok(await resolveAssessmentSourceReference({ ownerId: fixtures.subjects.a, sourceRef: sourceA._id, purpose: 'MATCHING', session }));
      assert.equal(await resolveAssessmentSourceReference({ ownerId: fixtures.subjects.a, sourceRef: sourceB._id, purpose: 'MATCHING', session }), null);
      assert.equal(await resolveAssessmentSourceReference({ ownerId: fixtures.subjects.a, sourceRef: `unregistered:${sourceA._id}`, purpose: 'MATCHING', session }), null);
      assert.equal(await resolveAssessmentSourceReference({ ownerId: fixtures.subjects.a, sourceRef: sourceA._id, purpose: 'PAIR_MODEL', session }), null);
    });
    const b = await readRun('b');
    await mutateRun('b', { action: 'matching-permission', matchingUse: false, expectedRevision: b.revision, idempotencyKey: key() });
    const unavailable = await read();
    assert.equal(unavailable.availability, 'UNAVAILABLE');
    assert.equal(unavailable.current, null);
    assert.deepEqual(unavailable.scenarios, []);
    await save('b', { parenthood: 'DO_NOT_WANT_CHILDREN', capacityMinutes: 0 });
    assert.deepEqual(await read(), unavailable);
    const direct = await read('b');
    await mutate('b', { action: 'revoke', expectedRevision: direct.direct.revision, idempotencyKey: key() });
    assert.deepEqual(await read(), unavailable);
    await save('b');
    const latest = await readRun('b');
    await mutateRun('b', { action: 'matching-permission', matchingUse: true, expectedRevision: latest.revision, idempotencyKey: key() });
    assert.equal((await current()).availability, 'AVAILABLE');
  });

  const finishPairLifecycle = await runAssessmentPairIntegration({
    fixtures, step, readRun, mutateRun, answerItem, current, readComparison: read, scenario, saveDirect: save,
    grantDirectPair: async (actor, allowed) => {
      const direct = await read(actor);
      await mutate(actor, { action: 'pair-permission', pairUse: allowed, expectedRevision: direct.direct.revision, idempotencyKey: key() });
    },
    mutateComparisonControl: async (actor, action) => {
      const controls = await comparisonGet(request(actor, 'comparison', undefined, '?view=controls')).then(unwrap<AssessmentComparisonDTO>);
      assert.equal(controls.availability, 'UNAVAILABLE');
      assert.equal(controls.current, null);
      assert.deepEqual(controls.scenarios, []);
      const payload = { action, intentToken: controls.intentToken, expectedRevision: controls.direct.revision, idempotencyKey: key(), ...(action === 'pair-permission' ? { pairUse: false } : {}) };
      const next = await comparisonPost(request(actor, 'comparison', payload)).then(unwrap<AssessmentComparisonDTO>);
      assert.equal(next.direct.revision, controls.direct.revision + 1);
      return next;
    },
  });

  await step(['INT-036'], 'Unknown suitable self report never invents a skill deficit', async () => {
    const before = await readRun('b');
    await mutateRun('b', { action: 'revise', expectedRevision: before.revision, idempotencyKey: key() });
    for (const item of DOM_S07_PUBLICATION.items.filter(item => item.method === 'SELF_REPORT' && !item.dependsOn)) {
      await answerItem('b', item.id, { kind: 'MISSING', reason: 'NO_EXPERIENCE' });
    }
    const draft = await readRun('b');
    const finalized = await mutateRun('b', { action: 'finalize', expectedRevision: draft.revision, idempotencyKey: key() });
    assert.deepEqual(finalized.profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07')?.A.possibleLevels, [0, 1, 2, 3]);
    const now = await current();
    assert.equal(now.current?.directions.A_FROM_B, 'UNRESOLVED');
    assert.equal(now.current?.status, 'NEEDS_CLARIFICATION');
    assert.ok(!now.current?.availableActions.some(action => action.id === 'B_demonstrates_full_cycle'));
  });

  await finishPairLifecycle();

  stage = 'complete';
  report('passed');
}
main().catch((error: Error) => {
  const code = error instanceof DomainError ? error.code : error.message;
  const safeCode = /^[A-Z][A-Z0-9_]{1,60}$/.test(code) ? code : 'ASSERTION';
  const line = /assessment-(?:comparison|pair)\.integration\.ts:(\d+)/.exec(error.stack ?? '')?.[1] ?? '0';
  stage = `Failure ${safeCode} line ${line}`;
  report('failed');
  process.exitCode = 1;
}).finally(async () => {
  if (fixtures) {
    await AssessmentComparison.deleteMany({ actorIds: { $in: Object.values(fixtures.subjects) } });
    await AssessmentDirect.deleteMany({ ownerId: { $in: Object.values(fixtures.subjects) } });
    await fixtures.cleanup();
  } else await mongoose.disconnect();
});
