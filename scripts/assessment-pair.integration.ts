import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/assessments/pair/route';
import { DOM_S07_PUBLICATION } from '@/domain/assessment/publication';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import { DomainError } from '@/domain/errors';
import { assessmentPairService } from '@/domain/services/assessmentPair.service';
import { pairsService } from '@/domain/services/pairs.service';
import { blockMatchingUser, unblockMatchingUser } from '@/domain/services/matching/matchingApplication.service';
import { productWorkspacePrivacy } from '@/domain/services/productWorkspacePrivacy.service';
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from '@/lib/api/response';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentComparisonDTO, AssessmentConditionalScenarioDTO } from '@/lib/dto/assessmentComparison.dto';
import type { AssessmentPairDTO, AssessmentPairMutation } from '@/lib/dto/assessmentPair.dto';
import { AssessmentPairReport, AssessmentPairWork } from '@/models/AssessmentPairWork';
import { AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentComparison } from '@/models/AssessmentComparison';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import type { WithoutAssessmentIntent } from './lib/assessment-test-intent';

type Actor = 'a' | 'b';
type OwnerPairMutation = WithoutAssessmentIntent<AssessmentPairMutation>;
export type AssessmentPairIntegrationContext = {
  fixtures: { subjects: Record<Actor, string>; assessmentPairId: string | null; sessionCookie: (actor: Actor) => string };
  step: (ids: string[], label: string, work: () => Promise<void>) => Promise<void>;
  readRun: (actor: Actor) => Promise<AssessmentRunDTO>;
  mutateRun: (actor: Actor, mutation: WithoutAssessmentIntent<AssessmentMutation>) => Promise<AssessmentRunDTO>;
  answerItem: (actor: Actor, itemId: string, response: AssessmentResponse) => Promise<void>;
  current: (actor?: Actor) => Promise<AssessmentComparisonDTO>;
  readComparison: (actor?: Actor) => Promise<AssessmentComparisonDTO>;
  scenario: (ids: Array<'A_demonstrates_full_cycle' | 'B_demonstrates_full_cycle' | 'joint_schedule'>, actor?: Actor) => Promise<AssessmentConditionalScenarioDTO>;
  grantDirectPair: (actor: Actor, allowed: boolean) => Promise<void>;
  saveDirect: (actor: Actor, patch?: Partial<AssessmentDirectAnswers>) => Promise<AssessmentComparisonDTO>;
  mutateComparisonControl: (actor: Actor, action: 'pair-permission' | 'revoke' | 'delete-direct') => Promise<AssessmentComparisonDTO>;
};

/** Runs inside the comparison suite's already-authenticated actual Pair fixture. */
export async function runAssessmentPairIntegration(context: AssessmentPairIntegrationContext): Promise<() => Promise<void>> {
  const { fixtures, step, readRun, mutateRun, answerItem, current, scenario, readComparison } = context;
  const key = () => randomUUID();
  const origin = 'http://localhost:3106';
  const pairContexts = new Map<Actor, NonNullable<AssessmentPairDTO['context']>>();
  const request = (actor: Actor | null, payload?: object, query = '') => new NextRequest(`${origin}/api/assessments/pair${query}`, {
    method: payload ? 'POST' : 'GET',
    headers: { ...(actor ? { cookie: fixtures.sessionCookie(actor).split(';')[0] } : {}), ...(payload ? { 'content-type': 'application/json', origin } : {}) },
    ...(payload ? { body: JSON.stringify({ context: actor ? pairContexts.get(actor) : undefined, ...payload }) } : {}),
  });
  async function unwrap(response: Response): Promise<AssessmentPairDTO> {
    const body = await response.json() as ApiSuccessEnvelope<AssessmentPairDTO> | ApiErrorEnvelope;
    if (!body.ok) throw new Error(`PAIR_HTTP_${response.status}_${body.error.code}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return body.data;
  }
  const read = async (actor: Actor = 'a') => {
    const dto = await GET(request(actor)).then(unwrap);
    if (dto.context) pairContexts.set(actor, dto.context);
    return dto;
  };
  const mutate = async (actor: Actor, mutation: OwnerPairMutation) => {
    if (!pairContexts.has(actor)) await read(actor);
    const dto = await POST(request(actor, mutation)).then(unwrap);
    if (dto.context) pairContexts.set(actor, dto.context);
    return dto;
  };
  const mutateService = async (actor: Actor, mutation: OwnerPairMutation, hooks?: Parameters<typeof assessmentPairService.mutate>[2]) => {
    if (!pairContexts.has(actor)) await read(actor);
    assert.ok(pairContexts.has(actor));
    return assessmentPairService.mutate(fixtures.subjects[actor], { ...mutation, context: pairContexts.get(actor)! }, hooks);
  };
  const denied = async (actor: Actor | null, payload: object | undefined, status: number) => {
    const result = payload ? await POST(request(actor, payload)) : await GET(request(actor));
    assert.equal(result.status, status);
    const body = await result.json() as ApiErrorEnvelope;
    assert.equal(body.ok, false);
    assert.ok(!JSON.stringify(body).includes(fixtures.subjects.b));
  };
  const confirm = async (actor: Actor) => {
    const own = await read(actor);
    assert.ok(own.agreement);
    return mutate(actor, { action: 'confirm', expectedRevision: own.revision, expectedContentRevision: own.agreement.contentRevision, idempotencyKey: key() });
  };
  const sourceRows = () => AssessmentRun.find({ ownerId: { $in: Object.values(fixtures.subjects) } }).sort({ ownerId: 1 }).lean();
  let periodId = '';
  let supportedScenarioId = '';

  await step(['INT-051', 'INT-052', 'INT-059'], 'Two sessions confirm one version without skill reward', async () => {
    await denied(null, undefined, 401);
    for (const actor of ['a', 'b'] as const) {
      const run = await readRun(actor);
      await mutateRun(actor, { action: 'permission', pairUse: true, expectedRevision: run.revision, idempotencyKey: key() });
      await context.grantDirectPair(actor, true);
    }
    await current();
    const selected = await scenario(['B_demonstrates_full_cycle']);
    assert.equal(selected.status, 'TARGET_SUPPORTED');
    supportedScenarioId = selected.id;
    const before = await sourceRows();
    const evidenceBefore = await EvidenceEvent.countDocuments({ actorId: { $in: Object.values(fixtures.subjects) } });
    const state = await read();
    const proposed = await mutate('a', { action: 'propose', expectedRevision: state.revision, idempotencyKey: key(), scenarioId: selected.id });
    assert.equal(proposed.agreement?.status, 'NEEDS_TWO_CONFIRMATIONS');
    assert.deepEqual(proposed.periods, []);
    const firstConfirmation: OwnerPairMutation = { action: 'confirm', expectedRevision: proposed.revision, expectedContentRevision: proposed.agreement!.contentRevision, idempotencyKey: key() };
    const once = await mutate('a', firstConfirmation);
    assert.equal(once.agreement?.status, 'NEEDS_TWO_CONFIRMATIONS');
    assert.deepEqual(once.periods, []);
    assert.deepEqual(once.agreement?.confirmations, { A: true, B: false });
    const base = { action: 'confirm', expectedRevision: once.revision, expectedContentRevision: once.agreement!.contentRevision, idempotencyKey: key() };
    for (const forged of [{ actor: 'B' }, { ownerId: fixtures.subjects.b }, { confirmations: { A: true, B: true } }, { contentHash: 'chosen-by-client' }]) await denied('a', { ...base, ...forged }, 400);
    await read('b');
    await denied('b', { ...base, context: once.context }, 409);
    await denied('a', { ...base, context: { ...once.context, pairId: '000000000000000000000001' } }, 409);
    assert.deepEqual((await read()).agreement?.confirmations, { A: true, B: false });
    const twice = await confirm('b');
    assert.equal(twice.agreement?.status, 'ACTIVE');
    assert.deepEqual(twice.agreement?.confirmations, { A: true, B: true });
    assert.equal(twice.agreement?.currentSkillChanged, false);
    const currentOwn = await read('a');
    assert.deepEqual(await mutate('a', firstConfirmation), currentOwn);
    assert.deepEqual(await sourceRows(), before);
    assert.equal(await EvidenceEvent.countDocuments({ actorId: { $in: Object.values(fixtures.subjects) } }), evidenceBefore);
    const stored = await AssessmentPairWork.findOne({ pairId: fixtures.assessmentPairId }).lean();
    assert.ok(stored);
    assert.ok(stored.activeAt);
    assert.ok(twice.periods.every(period => period.window.start >= stored.activeAt!.slice(0, 10)));
    assert.deepEqual(stored.confirmations.map(confirmation => confirmation.ownerId).sort(), Object.values(fixtures.subjects).sort());
    assert.ok(stored.confirmations.every(confirmation => confirmation.contentHash === stored.contentHash && confirmation.contentRevision === stored.contentRevision));
  });

  await step(['INT-053'], 'Changed agreement content needs fresh confirmations', async () => {
    const before = await read();
    const revised = await mutate('a', { action: 'revise', expectedRevision: before.revision, idempotencyKey: key(), scenarioId: supportedScenarioId });
    assert.equal(revised.agreement?.contentRevision, before.agreement!.contentRevision + 1);
    assert.equal(revised.agreement?.status, 'NEEDS_TWO_CONFIRMATIONS');
    assert.deepEqual(revised.agreement?.confirmations, { A: false, B: false });
    await denied('b', { action: 'confirm', expectedRevision: revised.revision, expectedContentRevision: before.agreement!.contentRevision, idempotencyKey: key() }, 409);
    await context.saveDirect('b', { capacityMinutes: 299 });
    await denied('b', { action: 'confirm', expectedRevision: revised.revision, expectedContentRevision: revised.agreement!.contentRevision, idempotencyKey: key() }, 409);
    await context.saveDirect('b');
    await current();
    const freshScenario = await scenario(['B_demonstrates_full_cycle']);
    const stale = await read();
    await mutate('a', { action: 'revise', expectedRevision: stale.revision, idempotencyKey: key(), scenarioId: freshScenario.id });
    await confirm('a');
    assert.equal((await confirm('b')).agreement?.status, 'ACTIVE');
  });

  await step(['INT-056', 'INT-057'], 'Two separate reports preserve disagreement and privacy', async () => {
    const before = await sourceRows();
    const state = await read();
    assert.ok(state.periods.length);
    await denied('a', { action: 'report', periodId: 'pair-week:1999-01-01', category: 'GOOD', shared: true, expectedRevision: state.revision, idempotencyKey: key() }, 400);
    periodId = state.periods.at(-1)!.id;
    await mutate('a', { action: 'report', periodId, category: 'GOOD', shared: true, expectedRevision: state.revision, idempotencyKey: key() });
    const b = await read('b');
    const paired = await mutate('b', { action: 'report', periodId, category: 'NEEDS_CHANGE', shared: true, expectedRevision: b.revision, idempotencyKey: key() });
    const report = paired.reports.find(row => row.periodId === periodId);
    assert.ok(report);
    assert.equal(report.A, 'GOOD');
    assert.equal(report.B, 'NEEDS_CHANGE');
    assert.equal(report.status, 'AT_LEAST_ONE_REQUESTS_CHANGE');
    assert.equal((await AssessmentPairReport.find({ pairId: fixtures.assessmentPairId, periodId }).lean()).length, 2);
    assert.deepEqual(await sourceRows(), before);
    await mutate('b', { action: 'revoke-report', periodId, expectedRevision: paired.revision, idempotencyKey: key() });
    const hidden = (await read()).reports.find(row => row.periodId === periodId)!;
    assert.equal(hidden.B, null);
    assert.equal(hidden.status, 'SHARED_DATA_INCOMPLETE');
    const latestB = await read('b');
    assert.equal(latestB.reports.find(row => row.periodId === periodId)?.own, 'NEEDS_CHANGE');
    await mutate('b', { action: 'report', periodId, category: 'GOOD', shared: false, expectedRevision: latestB.revision, idempotencyKey: key() });
    assert.deepEqual((await read()).reports.find(row => row.periodId === periodId), hidden);
    const exported = await productWorkspacePrivacy.exportOwnerData(fixtures.subjects.a);
    assert.ok(exported.assessmentPairReports.reports.every(row => row.value === 'GOOD'));
    assert.equal(exported.assessmentPairReports.reports.length, 1);
    assert.equal(exported.assessmentPairReports.truncated, false);
    await denied('a', { action: 'report', periodId, category: 'GOOD', shared: true, actor: 'B', expectedRevision: (await read()).revision, idempotencyKey: key() }, 400);
  });

  await step(['INT-058'], 'Completed comparable windows support only own ordinal trend', async () => {
    const now = new Date(Date.now() + 28 * 86400_000);
    const future = await assessmentPairService.get(fixtures.subjects.a, { now });
    const completed = future.periods.filter(period => Date.parse(period.window.end) <= now.getTime()
      && Date.parse(period.window.end) - Date.parse(period.window.start) === 7 * 86400_000)
      .sort((left, right) => left.window.start.localeCompare(right.window.start));
    assert.ok(completed.length >= 2);
    const [earlier, later] = completed;
    const first = await mutateService('a', {
      action: 'report', periodId: earlier.id, category: 'NEEDS_CHANGE', shared: false, expectedRevision: future.revision, idempotencyKey: key(),
    }, { now });
    const second = await mutateService('a', {
      action: 'report', periodId: later.id, category: 'GOOD', shared: false, expectedRevision: first.revision, idempotencyKey: key(),
    }, { now });
    assert.equal(second.reports.find(report => report.periodId === later.id)?.ownTrend, 'IMPROVED_REPORTED_CATEGORY');
    const partner = await assessmentPairService.get(fixtures.subjects.b, { now });
    assert.equal(partner.reports.find(report => report.periodId === later.id)?.A, null);
    assert.equal(partner.reports.find(report => report.periodId === later.id)?.ownTrend, 'UNKNOWN');
    const countBeforeCorrection = await AssessmentPairReport.countDocuments({ ownerId: fixtures.subjects.a });
    const corrected = await mutateService('a', {
      action: 'report', periodId: earlier.id, category: 'GOOD', shared: false, expectedRevision: second.revision, idempotencyKey: key(),
    }, { now });
    assert.equal(await AssessmentPairReport.countDocuments({ ownerId: fixtures.subjects.a }), countBeforeCorrection);
    assert.equal(corrected.reports.find(report => report.periodId === later.id)?.ownTrend, 'SAME_REPORTED_CATEGORY');
    const ongoing = future.periods.find(period => Date.parse(period.window.end) > now.getTime());
    assert.ok(ongoing);
    const provisional = await mutateService('a', {
      action: 'report', periodId: ongoing.id, category: 'GOOD', shared: false, expectedRevision: corrected.revision, idempotencyKey: key(),
    }, { now });
    assert.equal(provisional.reports.find(report => report.periodId === ongoing.id)?.ownTrend, 'UNKNOWN');
    assert.ok((await read()).reports.every(report => ![earlier.id, later.id, ongoing.id].includes(report.periodId)));
  });

  await step(['INT-060'], 'New independent followup observation changes actual profile', async () => {
    const old = await readRun('b');
    const currentBefore = await current();
    const before = await read('b');
    await mutate('b', { action: 'observe', expectedRevision: before.revision, idempotencyKey: key() });
    const round = await readRun('b');
    assert.equal(round.status, 'DRAFT');
    assert.equal((await current()).current?.directions.A_FROM_B, currentBefore.current?.directions.A_FROM_B);
    for (const item of DOM_S07_PUBLICATION.items) {
      const response: AssessmentResponse = item.kind === 'FACTS' ? {
        kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, !field.id.startsWith('NEG.') || field.id.endsWith('.eligible')])),
      } : { kind: 'OPTION', optionId: item.options[0].id };
      await answerItem('b', item.id, response);
    }
    const answered = await readRun('b');
    assert.ok(answered.answers.filter(answer => answer.itemId.endsWith('-facts')).every(answer => answer.phase === 'FOLLOWUP'));
    assert.equal(answered.answers.find(answer => answer.itemId === 'task-change')?.phase, 'ASSISTED');
    assert.equal(answered.answers.find(answer => answer.itemId === 'knowledge-cycle')?.phase, 'ASSISTED');
    const finalized = await mutateRun('b', { action: 'finalize', expectedRevision: answered.revision, idempotencyKey: key() });
    assert.ok(finalized.revision > old.revision);
    const skill = finalized.profile?.snapshot?.skills.find(skill => skill.skillId === 'DOM.S07');
    assert.equal(skill?.A.exactLevel, 3);
    assert.equal(skill?.A.phase, 'FOLLOWUP');
    const actual = await current();
    assert.equal(actual.current?.status, 'TARGET_SUPPORTED');
    assert.ok(actual.current!.revision > currentBefore.current!.revision);
    assert.deepEqual(actual.scenarios, []);
  });

  await step(['INT-062'], 'Actual server block wins over supported positive profiles', async () => {
    assert.equal((await current()).current?.status, 'TARGET_SUPPORTED');
    const auditRequest = { route: '/synthetic/assessment-integration', method: 'POST' };
    const info = console.info;
    console.info = () => undefined;
    try { await blockMatchingUser({ currentUserId: fixtures.subjects.b, blockedUserId: fixtures.subjects.a, auditRequest }); }
    finally { console.info = info; }
    const blockedComparison = await readComparison();
    const blockedPair = await read();
    assert.equal(blockedComparison.availability, 'UNAVAILABLE');
    assert.equal(blockedComparison.current, null);
    assert.deepEqual(blockedComparison.scenarios, []);
    assert.equal(blockedPair.availability, 'UNAVAILABLE');
    assert.equal(blockedPair.agreement, null);
    assert.ok(!JSON.stringify([blockedComparison, blockedPair]).includes('BLOCK'));
    console.info = () => undefined;
    try { await unblockMatchingUser({ currentUserId: fixtures.subjects.b, blockedUserId: fixtures.subjects.a, auditRequest }); }
    finally { console.info = info; }
    assert.equal((await current()).current?.status, 'TARGET_SUPPORTED');
  });

  await step(['INT-040'], 'Resource failure does not erase either supported direction', async () => {
    await context.saveDirect('b', { capacityMinutes: 170 });
    const constrained = await current();
    assert.deepEqual(constrained.current?.directions, { A_FROM_B: 'SUPPORTED', B_FROM_A: 'SUPPORTED' });
    assert.equal(constrained.current?.resourceStatus, 'NOT_SUPPORTED');
    assert.notEqual(constrained.current?.status, 'TARGET_SUPPORTED');
    await context.saveDirect('b');
    assert.equal((await current()).current?.status, 'TARGET_SUPPORTED');
  });

  // Destructive lifecycle assertions run after I03's final unknown-data check.
  // No real user or external database is touched; the harness owns this Pair.
  return async () => {
    await step(['INT-061', 'INT-064'], 'Late pair preparation cannot revive revoked dependencies', async () => {
      const initial = await read();
      await mutate('b', { action: 'report', periodId, category: 'GOOD', shared: true, expectedRevision: initial.revision, idempotencyKey: key() });
      const state = await read();
      const beforeB = await AssessmentPairReport.find({ ownerId: fixtures.subjects.b }).lean();
      assert.ok(beforeB.some(report => report.shared));
      await assert.rejects(mutateService('a', { action: 'revise', scenarioId: null, expectedRevision: state.revision, idempotencyKey: key() }, {
        afterPrepared: async () => {
          const b = await readRun('b');
          await mutateRun('b', { action: 'permission', pairUse: false, expectedRevision: b.revision, idempotencyKey: key() });
        },
      }), (error: Error) => error instanceof DomainError && error.status === 409);
      assert.equal((await read()).availability, 'UNAVAILABLE');
      assert.deepEqual(await AssessmentPairReport.find({ ownerId: fixtures.subjects.b }).lean(), beforeB);
      assert.ok((await AssessmentComparison.find({ actorIds: fixtures.subjects.b }).lean()).every(row => row.scenarios.length === 0));
      const sourceA = await readRun('a');
      process.env.ASSESSMENT_MODE = 'OFF';
      try {
        await denied('a', { action: 'propose', scenarioId: null, expectedRevision: state.revision, idempotencyKey: key() }, 404);
        const exported = await productWorkspacePrivacy.exportOwnerData(fixtures.subjects.b);
        assert.ok(exported.assessmentPairReports.reports.length);
        await mutateRun('a', { action: 'delete', expectedRevision: sourceA.revision, idempotencyKey: key() });
        assert.deepEqual(await AssessmentPairReport.find({ ownerId: fixtures.subjects.b }).lean(), beforeB);
        const retained = await AssessmentDirect.findById(fixtures.subjects.a).lean();
        const deletedSource = await AssessmentRun.findOne({ ownerId: fixtures.subjects.a }).lean();
        const peerDirectBefore = await AssessmentDirect.findById(fixtures.subjects.b).lean();
        assert.ok(retained?.answers && deletedSource?.status === 'DELETED');
        assert.ok(retained.deletionGeneration < deletedSource.deletionGeneration);
        await context.mutateComparisonControl('a', 'pair-permission');
        assert.equal((await AssessmentDirect.findById(fixtures.subjects.a).lean())?.pairUse, false);
        await context.mutateComparisonControl('a', 'revoke');
        assert.equal((await AssessmentDirect.findById(fixtures.subjects.a).lean())?.useForComparison, false);
        await context.mutateComparisonControl('a', 'delete-direct');
        const deletedDirect = await AssessmentDirect.findById(fixtures.subjects.a).lean();
        assert.equal(deletedDirect?.status, 'DELETED');
        assert.equal(deletedDirect?.answers, null);
        assert.deepEqual(await AssessmentDirect.findById(fixtures.subjects.b).lean(), peerDirectBefore);
        assert.equal((await productWorkspacePrivacy.exportOwnerData(fixtures.subjects.a)).assessmentDirect, null);
        const refreshed = await GET(request('b', undefined, `?view=controls&pairId=${fixtures.assessmentPairId}`)).then(unwrap);
        assert.ok(refreshed.context);
        pairContexts.set('b', refreshed.context);
        assert.deepEqual(refreshed.reports, []);
        const controls = await mutate('b', { action: 'revoke-report', periodId, expectedRevision: refreshed.revision, idempotencyKey: key() });
        assert.equal(controls.availability, 'UNAVAILABLE');
        assert.ok((await AssessmentPairReport.find({ ownerId: fixtures.subjects.b }).lean()).every(report => !report.shared));
      } finally { delete process.env.ASSESSMENT_MODE; }
      await assert.rejects(() => context.saveDirect('a'), /COMPARISON_HTTP_409_SOURCE_UNAVAILABLE/);
      await assert.rejects(() => context.grantDirectPair('a', true), /COMPARISON_HTTP_409_SOURCE_UNAVAILABLE/);
    });
    await step(['INT-054'], 'Ending actual Pair closes historical context', async () => {
      await pairsService.endPair({ pairId: fixtures.assessmentPairId!, currentUserId: fixtures.subjects.b });
      const ended = await read();
      assert.equal(ended.availability, 'UNAVAILABLE');
      assert.equal(ended.agreement, null);
      assert.equal((await readComparison()).availability, 'UNAVAILABLE');
      const queried = await GET(request('a', undefined, `?pairId=${fixtures.assessmentPairId}`)).then(unwrap);
      assert.deepEqual(queried, ended);
      process.env.ASSESSMENT_MODE = 'OFF';
      try {
        const controls = await GET(request('b', undefined, `?view=controls&pairId=${fixtures.assessmentPairId}`)).then(unwrap);
        assert.ok(controls.context);
        pairContexts.set('b', controls.context);
        const withdrawn = await mutate('b', { action: 'revoke', expectedRevision: controls.revision, idempotencyKey: key() });
        assert.equal(withdrawn.availability, 'UNAVAILABLE');
        assert.deepEqual(withdrawn.reports, []);
        assert.equal((await AssessmentPairWork.findOne({ pairId: fixtures.assessmentPairId }).lean())?.revoked, true);
      } finally { delete process.env.ASSESSMENT_MODE; }
    });
    await AssessmentPairWork.deleteMany({ actorIds: { $in: Object.values(fixtures.subjects) } });
    await AssessmentPairReport.deleteMany({ ownerId: { $in: Object.values(fixtures.subjects) } });
  };
}
