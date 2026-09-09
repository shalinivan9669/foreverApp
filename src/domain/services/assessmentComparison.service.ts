import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { assessmentEnvelopeSchema, isAssessmentEnvelopeCurrent, type AssessmentCalculationEnvelope, type AssessmentWindow } from '@/domain/assessment/boundaries';
import { ASSESSMENT_COMPARISON_NORMALIZER, ASSESSMENT_COMPARISON_PUBLICATION, assessmentDirectAnswersSchema, buildAssessmentComparisonProblem, type AssessmentComparableSkill } from '@/domain/assessment/comparison';
import type { AssessmentPeriod } from '@/domain/assessment/contracts';
import { evaluateModel, findConditionalPlans, type Evaluation, type EvaluationResult, type Limits, type Problem, type SearchResult } from '@/domain/assessment/engine/matching';
import type { AssessmentProfileSnapshot } from '@/domain/assessment/profile';
import { DOM_S07_PUBLICATION } from '@/domain/assessment/publication';
import { AssessmentComparisonMutationSchema, AssessmentCurrentComparisonSchema, AssessmentConditionalScenarioSchema, type AssessmentComparisonDTO, type AssessmentComparisonMutation, type AssessmentConditionalScenarioDTO, type AssessmentCurrentComparisonDTO, type AssessmentDirectionalStatus } from '@/lib/dto/assessmentComparison.dto';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { AssessmentComparison, type AssessmentComparisonType } from '@/models/AssessmentComparison';
import { AssessmentDirect, type AssessmentDirectType } from '@/models/AssessmentDirect';
import { AssessmentRun, AssessmentOperation, type AssessmentRunType } from '@/models/AssessmentRun';
import type { AssessmentParticipantType } from '@/models/AssessmentParticipant';
import { MatchingBlock } from '@/models/MatchingBlock';
import { Pair } from '@/models/Pair';
import { SessionSubject } from '@/models/SessionSubject';
import { assessmentFail as fail, assessmentTransaction, isAssessmentEnabled, requireAssessmentOwner } from './assessmentAccess.service';
import { currentAssessmentSource } from './assessmentRuns.service';

const identity = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const sourceId = (ownerId: string) => `assessment:${identity(ownerId, DOM_S07_PUBLICATION.id)}`;
const comparisonId = (pairId: string, ownerId: string) => identity('assessment-comparison-v1', pairId, ownerId);
const DEFAULT_LIMITS: Limits = { maxWorlds: 1024, maxChecks: 200000, maxActionSets: 512, maxActionsPerSet: 3 };

async function intentTokenFor(ownerId: string, session: ClientSession, cohortId: string): Promise<string> {
  const account = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId), $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }] }).session(session).select({ version: 1 }).lean<{ version: string } | null>();
  if (!account) return fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
  const pair = await Pair.findOne({ members: ownerId, status: { $in: ['active', 'paused'] } }).session(session).sort({ createdAt: -1 }).select({ _id: 1, members: 1, status: 1, contextVersion: 1 }).lean();
  const context = pair ? { id: String(pair._id), members: pair.members, status: pair.status, version: pair.contextVersion } : null;
  return identity('assessment-comparison-intent-v1', ownerId, account.version, cohortId, JSON.stringify(context));
}

async function requireIntent(ownerId: string, token: string, session: ClientSession, cohortId: string): Promise<void> {
  if (token !== await intentTokenFor(ownerId, session, cohortId)) fail('ASSESSMENT_INTENT_STALE', 'Аккаунт или контекст изменился. Откройте форму заново.');
}
type ResolvedRun = AssessmentRunType & { snapshot: AssessmentProfileSnapshot };
export type AssessmentResolvedSource = { run: ResolvedRun; participant: AssessmentParticipantType; accountGeneration: string };
export type AssessmentComparisonScopeParticipant = AssessmentResolvedSource & { direct: AssessmentDirectType };
export type AssessmentComparisonScope = {
  pairId: string; pairMembers: [string, string]; myRole: 'A' | 'B'; contextRevision: number;
  period: AssessmentPeriod; window: AssessmentWindow; A: AssessmentComparisonScopeParticipant; B: AssessmentComparisonScopeParticipant;
  purpose: 'MATCHING' | 'PAIR_MODEL'; problem: Problem;
};

/** Exact registered source resolver; an unrecognized prefix or another owner's reference never falls through. */
export async function resolveAssessmentSourceReference(input: {
  ownerId: string; sourceRef: string; purpose: 'MATCHING' | 'PAIR_MODEL'; session: ClientSession;
}): Promise<AssessmentResolvedSource | null> {
  if (!input.sourceRef.startsWith('assessment:') || input.sourceRef !== sourceId(input.ownerId)) return null;
  const participant = await requireAssessmentOwner(input.ownerId, { session: input.session, fence: true });
  const stored = await AssessmentRun.findOne({ _id: input.sourceRef, ownerId: input.ownerId, status: { $ne: 'DELETED' } }).session(input.session).lean<AssessmentRunType | null>();
  const run = stored ? currentAssessmentSource(stored) : null;
  if (!run || run.status !== 'FINALIZED' || !run.snapshot || run.materializedRevision !== run.revision
    || run.deletionGeneration !== participant.deletionGeneration
    || run.publicationId !== DOM_S07_PUBLICATION.id || run.publicationVersion !== DOM_S07_PUBLICATION.version
    || run.snapshot.sourceId !== run._id || run.snapshot.revision !== run.revision
    || run.snapshot.generation !== run.deletionGeneration || run.snapshot.publicationId !== run.publicationId
    || run.snapshot.publicationVersion !== run.publicationVersion
    || run.snapshot.schemaVersion !== 'assessment-profile-v1' || run.snapshot.contextKey !== DOM_S07_PUBLICATION.contextKey
    || JSON.stringify(run.snapshot.period) !== JSON.stringify(run.period)
    || !(input.purpose === 'MATCHING' ? run.matchingUse === true : run.pairUse === true)) return null;
  const account = await SessionSubject.findOne({ subjectKey: privacySubjectHash(input.ownerId), $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }] }).session(input.session).select({ version: 1 }).lean<{ version: string } | null>();
  return account ? { run: { ...run, snapshot: run.snapshot }, participant, accountGeneration: account.version } : null;
}

function comparableSkills(snapshot: AssessmentProfileSnapshot, window: AssessmentWindow): AssessmentComparableSkill[] {
  return snapshot.skills.map((skill) => ({
    skillId: skill.skillId, rubricVersion: skill.rubricVersion, track: skill.A.method, phase: skill.A.phase,
    context: snapshot.contextKey, window, possibleLevels: skill.A.possibleLevels,
    status: skill.A.status === 'INCONSISTENT' ? 'INCONSISTENT_EVIDENCE'
      : skill.A.status === 'UNKNOWN' ? 'UNKNOWN' : skill.A.exactLevel === null ? 'PARTIAL_LEVEL' : 'RUBRIC_LEVEL',
  }));
}

/** Caller owns the transaction; both participant fences and the Pair fence use the same session. */
export async function captureAssessmentComparisonScope(ownerId: string, purpose: 'MATCHING' | 'PAIR_MODEL', session: ClientSession): Promise<AssessmentComparisonScope | null> {
  await requireAssessmentOwner(ownerId, { session, fence: true });
  const candidate = await Pair.findOne({ members: ownerId, status: 'active' }).session(session).select({ _id: 1 }).lean();
  if (!candidate) return null;
  const guard = await requirePairMember(String(candidate._id), ownerId);
  if (!guard.ok) return null;
  // Touching this document creates a lifecycle write conflict without manufacturing a new context revision.
  const pair = await Pair.findOneAndUpdate({ _id: candidate._id, members: ownerId, status: 'active' }, { $currentDate: { updatedAt: true } }, { session, new: true }).lean();
  if (!pair || pair.contextVersion !== 'pair-context-v1' || pair.members.length !== 2 || pair.members[0] === pair.members[1]) return null;
  const [ownerA, ownerB] = pair.members;
  const resolved = new Map<string, AssessmentResolvedSource>();
  for (const participantId of [...pair.members].sort()) {
    const item = await resolveAssessmentSourceReference({ ownerId: participantId, sourceRef: sourceId(participantId), purpose, session });
    if (!item) return null;
    resolved.set(participantId, item);
  }
  const a = resolved.get(ownerA)!, b = resolved.get(ownerB)!;
  if (a.participant.cohortId !== b.participant.cohortId || JSON.stringify(a.run.period) !== JSON.stringify(b.run.period)) return null;
  const directA = await AssessmentDirect.findOne({ _id: ownerA, ownerId: ownerA, status: 'ACTIVE' }).session(session).lean<AssessmentDirectType | null>();
  const directB = await AssessmentDirect.findOne({ _id: ownerB, ownerId: ownerB, status: 'ACTIVE' }).session(session).lean<AssessmentDirectType | null>();
  if (!directA || !directB || !directA.answers || !directB.answers
    || directA.deletionGeneration !== a.participant.deletionGeneration || directB.deletionGeneration !== b.participant.deletionGeneration
    || !(purpose === 'MATCHING' ? directA.useForComparison && directB.useForComparison : directA.pairUse && directB.pairUse)
    || JSON.stringify(directA.period) !== JSON.stringify(a.run.period) || JSON.stringify(directB.period) !== JSON.stringify(b.run.period)) return null;
  if (!assessmentDirectAnswersSchema.safeParse(directA.answers).success || !assessmentDirectAnswersSchema.safeParse(directB.answers).success) return null;
  const blocked = await MatchingBlock.exists({ status: 'ACTIVE', $or: [{ blockerId: ownerA, blockedId: ownerB }, { blockerId: ownerB, blockedId: ownerA }] }).session(session);
  const protection = (source: ResolvedRun) => source.snapshot.skills.some((skill) => skill.NMinus.some((pattern) => pattern.protectiveRoute)) ? 'BLOCK' as const : 'ALLOW' as const;
  const period = a.run.period;
  const window: AssessmentWindow = { start: period.startsAt.slice(0, 10), end: period.endsAt.slice(0, 10), definitionVersion: 'household-responsibility-28d-v1' };
  const A = { ...a, direct: directA }, B = { ...b, direct: directB };
  const problem = buildAssessmentComparisonProblem({
    // The legacy engine's scalar revision fields are only a wrapper. Complete per-person revisions live in the envelope.
    snapshotId: identity('assessment-input-v1', pair._id.toString(), ownerId, JSON.stringify([a.run.revision, b.run.revision, directA.revision, directB.revision])),
    snapshotRevision: 1, permissionRevision: 1, mode: purpose === 'MATCHING' ? 'MATCHING' : 'PAIR',
    context: a.run.snapshot.contextKey, window, access: blocked ? 'UNAVAILABLE' : 'AVAILABLE',
    A: { ownerId: ownerA, direct: directA.answers, protection: protection(a.run), skills: comparableSkills(a.run.snapshot, window) },
    B: { ownerId: ownerB, direct: directB.answers, protection: protection(b.run), skills: comparableSkills(b.run.snapshot, window) },
  });
  if (problem.snapshot.gate === 'UNAVAILABLE') return null;
  return { pairId: String(pair._id), pairMembers: [ownerA, ownerB], myRole: ownerA === ownerId ? 'A' : 'B', contextRevision: pair.lifecycleRevision ?? 0, period, window, A, B, purpose, problem };
}

function envelopeFor(scope: AssessmentComparisonScope, ownerId: string, options: { actionIds: readonly string[]; searchActionIds?: readonly string[]; limits: Limits; completeness: AssessmentCalculationEnvelope['completeness'] }): AssessmentCalculationEnvelope {
  const version = (person: AssessmentComparisonScopeParticipant) => ({
    sourceRevision: person.run.revision, profileRevision: person.run.snapshot.revision, permissionRevision: person.run.permissionRevision,
    directRevision: person.direct.revision, directPermissionRevision: person.direct.permissionRevision, directDeletionGeneration: person.direct.deletionGeneration,
    deletionGeneration: person.participant.deletionGeneration, accountGeneration: person.accountGeneration,
  });
  const selected = scope.problem.changes.filter((action) => options.actionIds.includes(action.id));
  return assessmentEnvelopeSchema.parse({
    schemaVersion: 'assessment-envelope-v1', calculationKind: options.actionIds.length ? 'CONDITIONAL' : 'CURRENT',
    mode: scope.purpose === 'MATCHING' ? 'MATCHING' : 'PAIR', purpose: scope.purpose, audience: 'OWNER', viewerId: ownerId,
    actorBindings: { A: scope.pairMembers[0], B: scope.pairMembers[1] }, relationshipRef: scope.pairId,
    participants: { A: version(scope.A), B: version(scope.B) }, context: `${scope.problem.snapshot.context}:pair-context-v1:active`, contextRevision: scope.contextRevision,
    window: scope.window, publicationId: ASSESSMENT_COMPARISON_PUBLICATION,
    contentHash: identity(JSON.stringify(DOM_S07_PUBLICATION)), rubricVersion: DOM_S07_PUBLICATION.rubricVersion,
    policyVersion: DOM_S07_PUBLICATION.policyStatus, normalizerVersion: ASSESSMENT_COMPARISON_NORMALIZER,
    solverVersion: 'matching-v0.3-application-v1', templateVersion: 'dom-s07-comparison-dto-v1',
    consumedInputHash: identity(JSON.stringify(scope.problem)), selectedPublishedActionIds: [...options.actionIds], searchActionCatalogIds: [...(options.searchActionIds ?? options.actionIds)],
    resourceAssumptions: scope.problem.resources.map((resource) => ({ ...resource,
      ordinaryUse: scope.problem.configurations[0].use[resource.id] ?? 0,
      scenarioUse: selected.reduce((total, action) => total + (action.costs[resource.id] ?? 0), 0),
    })), searchLimits: options.limits, completeness: options.completeness, access: 'AVAILABLE',
  });
}

export const assessmentEnvelopeForScope = envelopeFor;

function direction(evaluation: Evaluation, actor: 'A' | 'B'): AssessmentDirectionalStatus {
  if (evaluation.plans.some((plan) => plan.robustTarget)) return 'SUPPORTED';
  const ids = actor === 'A' ? ['parenthood', 'relationshipFormat', 'A_need_shopping_cycle', 'mutualTime'] : ['parenthood', 'relationshipFormat', 'B_need_cooking_cycle', 'mutualTime'];
  if (evaluation.plans.every((plan) => ids.some((id) => plan.requirementStatus[id] === 'F'))) return 'NOT_SUPPORTED';
  return evaluation.plans.some((plan) => ids.every((id) => plan.requirementStatus[id] === 'T')) ? 'SUPPORTED' : 'UNRESOLVED';
}

function currentDTO(result: EvaluationResult, scope: AssessmentComparisonScope, revision: number, limits: Limits): AssessmentCurrentComparisonDTO {
  if (result.kind === 'UNAVAILABLE') return fail('ASSESSMENT_COMPARISON_UNAVAILABLE', 'Сравнение сейчас недоступно.');
  const evaluation = result.kind === 'RESULT' ? result.value : null;
  const barriers: AssessmentCurrentComparisonDTO['barriers'] = [];
  const mappings: Array<[string, AssessmentCurrentComparisonDTO['barriers'][number]]> = [['parenthood', 'PARENTHOOD'], ['relationshipFormat', 'RELATIONSHIP_FORMAT'], ['A_need_shopping_cycle', 'HOUSEHOLD_ROLES'], ['B_need_cooking_cycle', 'HOUSEHOLD_ROLES'], ['mutualTime', 'TIME']];
  for (const [id, label] of mappings) if (evaluation?.independentFailingRequirements.includes(id) && !barriers.includes(label)) barriers.push(label);
  return {
    kind: 'CURRENT', revision, status: evaluation?.status ?? 'INCOMPLETE',
    directions: { A_FROM_B: evaluation ? direction(evaluation, 'A') : 'UNRESOLVED', B_FROM_A: evaluation ? direction(evaluation, 'B') : 'UNRESOLVED' },
    resourceStatus: evaluation?.plans.some((plan) => plan.resourceStatus === 'T') ? 'SUPPORTED' : evaluation?.plans.every((plan) => plan.resourceStatus === 'F') ? 'NOT_SUPPORTED' : 'UNRESOLVED',
    barriers, explanation: evaluation?.status === 'TARGET_SUPPORTED' ? 'В рассмотренных условиях текущие разрешённые данные поддерживают общий вариант. Это не прогноз качества отношений.'
      : evaluation?.status === 'NEEDS_CLARIFICATION' ? 'Нужны уточнения: неизвестность не означает установленный дефицит навыка.'
        : 'В рассмотренном наборе условий есть различия или неполнота. Условные сценарии показываются отдельно от текущего результата.',
    availableActions: scope.problem.changes.filter((action) => action.owners.every((actor) => action.willingness[actor] !== 'F')).map((action) => ({ id: action.id, label: action.label, requiresChoice: action.owners.some((actor) => action.willingness[actor] === 'U') })),
    limits, completeness: result.kind === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : 'COMPLETE_WITHIN_LIMITS',
  };
}

function scenarioDTO(result: EvaluationResult, scope: AssessmentComparisonScope, currentRevision: number, actionIds: string[], limits: Limits, searchActionIds = actionIds): AssessmentConditionalScenarioDTO {
  if (result.kind === 'UNAVAILABLE') return fail('ASSESSMENT_COMPARISON_UNAVAILABLE', 'Сравнение сейчас недоступно.');
  const selected = scope.problem.changes.filter((action) => actionIds.includes(action.id));
  const own = scope.myRole === 'A' ? scope.A.direct : scope.B.direct;
  return {
    id: identity('assessment-scenario-v1', scope.pairId, String(currentRevision), scope.myRole, ...[...actionIds].sort()),
    kind: 'HYPOTHETICAL', baseRevision: currentRevision, status: result.kind === 'RESULT' ? result.value.status : 'INCOMPLETE',
    changesCurrentScore: false, actionIds, searchActionIds, assumptions: selected.map((action) => action.label),
    voluntaryState: selected.some((action) => action.owners.some((actor) => action.willingness[actor] === 'U')) ? 'MODEL_OPTION_NOT_CHOSEN' : 'DECLARED_OPEN_NOT_AGREED',
    ownResources: { unit: 'minute', period: scope.period, ordinaryUse: own.answers!.ordinaryTaskMinutes,
      attemptUse: selected.reduce((total, action) => total + (action.costs[`${scope.myRole}_minutes`] ?? 0), 0), capacity: own.answers!.capacityMinutes },
    verification: selected.map((action) => action.verification), explanation: 'В пределах указанных лимитов проверены сочетания выбранных опубликованных действий. Это допущение результата: бюджет не обещает освоения навыка, текущий профиль не изменён. Вариант не является единственным или самым дешёвым решением; согласия на договорённость ещё нет.',
    limits, completeness: result.kind === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : 'COMPLETE_WITHIN_LIMITS',
  };
}

function ownDirectDTO(row: AssessmentDirectType | null, generation: number): AssessmentComparisonDTO['direct'] {
  const parsed = assessmentDirectAnswersSchema.safeParse(row?.answers);
  const active = row?.status === 'ACTIVE' && row.deletionGeneration === generation && parsed.success;
  return { revision: row?.revision ?? 0, permissionRevision: row?.permissionRevision ?? 0, answers: active ? parsed.data : null,
    useForComparison: active ? row.useForComparison : false, pairUse: active ? row.pairUse : false, period: active ? row.period : null };
}

function validStoredEnvelope(envelope: AssessmentCalculationEnvelope, scope: AssessmentComparisonScope, ownerId: string, kind: 'CURRENT' | 'CONDITIONAL'): boolean {
  const parsed = assessmentEnvelopeSchema.safeParse(envelope);
  if (!parsed.success || parsed.data.calculationKind !== kind) return false;
  const expected = envelopeFor(scope, ownerId, { actionIds: parsed.data.selectedPublishedActionIds,
    searchActionIds: parsed.data.searchActionCatalogIds, limits: parsed.data.searchLimits, completeness: parsed.data.completeness });
  return isAssessmentEnvelopeCurrent(parsed.data, expected);
}

export function assessmentProjectionMatchesEnvelope(dto: AssessmentCurrentComparisonDTO | AssessmentConditionalScenarioDTO, envelope: AssessmentCalculationEnvelope): boolean {
  if (JSON.stringify(dto.limits) !== JSON.stringify(envelope.searchLimits) || dto.completeness !== envelope.completeness) return false;
  if (dto.kind === 'CURRENT') return envelope.calculationKind === 'CURRENT' && envelope.selectedPublishedActionIds.length === 0;
  return envelope.calculationKind === 'CONDITIONAL'
    && JSON.stringify([...dto.actionIds].sort()) === JSON.stringify([...envelope.selectedPublishedActionIds].sort())
    && JSON.stringify([...dto.searchActionIds].sort()) === JSON.stringify([...envelope.searchActionCatalogIds].sort());
}

async function readComparison(ownerId: string, control: boolean): Promise<AssessmentComparisonDTO> {
  return assessmentTransaction(async (session) => {
    const participant = await requireAssessmentOwner(ownerId, { control, session, fence: true });
    const intentToken = await intentTokenFor(ownerId, session, participant.cohortId);
    const direct = ownDirectDTO(await AssessmentDirect.findById(ownerId).session(session).lean<AssessmentDirectType | null>(), participant.deletionGeneration);
    const empty: AssessmentComparisonDTO = { intentToken, direct, context: null, availability: 'UNAVAILABLE', current: null, scenarios: [] };
    if (control) return isAssessmentEnabled() ? empty : { ...empty, direct: { ...direct, answers: null, period: null } };
    const scope = await captureAssessmentComparisonScope(ownerId, 'MATCHING', session);
    if (!scope) return empty;
    const base = { ...empty, availability: 'AVAILABLE' as const, context: { pairId: scope.pairId, period: scope.period, myRole: scope.myRole } };
    const stored = await AssessmentComparison.findById(comparisonId(scope.pairId, ownerId)).session(session).lean<AssessmentComparisonType | null>();
    if (!stored) return base;
    const parsedCurrent = AssessmentCurrentComparisonSchema.safeParse(stored.current);
    if (!validStoredEnvelope(stored.envelope, scope, ownerId, 'CURRENT') || !parsedCurrent.success || parsedCurrent.data.revision !== stored.revision || !assessmentProjectionMatchesEnvelope(parsedCurrent.data, stored.envelope)) return base;
    const scenarios = (Array.isArray(stored.scenarios) ? stored.scenarios : []).flatMap((item) => {
      const parsedScenario = AssessmentConditionalScenarioSchema.safeParse(item?.dto);
      return item && validStoredEnvelope(item.envelope, scope, ownerId, 'CONDITIONAL') && parsedScenario.success && parsedScenario.data.baseRevision === stored.revision && assessmentProjectionMatchesEnvelope(parsedScenario.data, item.envelope) ? [parsedScenario.data] : [];
    });
    return { ...base, current: parsedCurrent.data, scenarios };
  });
}

export const getFreshAssessmentComparison = (ownerId: string) => readComparison(ownerId, false);
export type AssessmentComparisonHooks = { afterComputed?: () => Promise<void>; limits?: Partial<Limits> };

async function mutateDirect(ownerId: string, mutation: Extract<AssessmentComparisonMutation, { action: 'save-direct' | 'revoke' | 'pair-permission' | 'delete-direct' }>, control: boolean): Promise<void> {
  await assessmentTransaction(async (session) => {
    const participant = await requireAssessmentOwner(ownerId, { control, session, fence: true });
    await requireIntent(ownerId, mutation.intentToken, session, participant.cohortId);
    const normalized = mutation.action === 'save-direct' ? { ...mutation, answers: { ...mutation.answers,
      acceptableMeetingSlots: mutation.answers.acceptableMeetingSlots && [...mutation.answers.acceptableMeetingSlots].sort(),
      proposedMeetingSlots: mutation.answers.proposedMeetingSlots && [...mutation.answers.proposedMeetingSlots].sort() } } : mutation;
    const operationId = identity('assessment-direct-operation', ownerId, mutation.idempotencyKey), requestHash = identity(JSON.stringify(normalized));
    const previous = await AssessmentOperation.findById(operationId).session(session).lean();
    if (previous) { if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.'); return; }
    let row = await AssessmentDirect.findOne({ _id: ownerId, ownerId }).session(session).lean<AssessmentDirectType | null>();
    if ((row?.revision ?? 0) !== mutation.expectedRevision) fail('ASSESSMENT_STALE', 'Данные изменились в другой вкладке.');
    if (!row) {
      if (mutation.action !== 'save-direct') fail('ASSESSMENT_DIRECT_MISSING', 'Сначала сохраните собственные условия.');
      const run = await AssessmentRun.findOne({ _id: sourceId(ownerId), ownerId, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }).session(session).lean<AssessmentRunType | null>();
      if (!run) fail('ASSESSMENT_NOT_STARTED', 'Сначала откройте анкету.');
      row = { _id: ownerId, ownerId, revision: 0, permissionRevision: 0, deletionGeneration: participant.deletionGeneration, useForComparison: false, pairUse: false, status: 'ACTIVE', period: run.period, answers: null, createdAt: new Date(), updatedAt: new Date() };
    }
    // A revoked source generation blocks further use, but its owner must still
    // be able to withdraw permissions or erase the retained direct answers.
    if (!control && (row.status === 'DELETED' || row.deletionGeneration !== participant.deletionGeneration)) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
    if (mutation.action === 'save-direct') {
      const source = await AssessmentRun.findOne({ _id: sourceId(ownerId), ownerId, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }).session(session).lean<AssessmentRunType | null>();
      if (!source) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
      row.period = source.period;
      row.answers = assessmentDirectAnswersSchema.parse(normalized.action === 'save-direct' ? normalized.answers : mutation.answers);
      if (row.useForComparison !== mutation.useForComparison) row.permissionRevision++;
      row.useForComparison = mutation.useForComparison;
    } else if (mutation.action === 'pair-permission') {
      if (row.pairUse !== mutation.pairUse) row.permissionRevision++;
      row.pairUse = mutation.pairUse;
    } else {
      row.useForComparison = false; row.permissionRevision++;
      if (mutation.action === 'delete-direct') { row.status = 'DELETED'; row.answers = null; row.pairUse = false; row.deletionGeneration++; }
    }
    row.revision++;
    const { _id, createdAt, updatedAt, ...fields } = row;
    void createdAt; void updatedAt;
    await AssessmentDirect.updateOne({ _id, ownerId }, { $set: fields }, { upsert: true, session });
    // Keep the canonical comparison revision, but remove conditional derived copies immediately.
    await AssessmentComparison.updateMany({ actorIds: ownerId }, { $set: { scenarios: [] } }, { session });
    await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: row.revision }], { session });
  });
}

async function calculate(ownerId: string, mutation: Extract<AssessmentComparisonMutation, { action: 'calculate-current' | 'scenario' }>, hooks: AssessmentComparisonHooks): Promise<void> {
  const operationId = identity('assessment-comparison-operation', ownerId, mutation.idempotencyKey);
  const requestHash = identity(JSON.stringify(mutation.action === 'scenario' ? { ...mutation, actionIds: [...mutation.actionIds].sort() } : mutation));
  const captured = await assessmentTransaction(async (session) => {
    const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
    await requireIntent(ownerId, mutation.intentToken, session, participant.cohortId);
    const previous = await AssessmentOperation.findById(operationId).session(session).lean();
    if (previous) { if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.'); return null; }
    const scope = await captureAssessmentComparisonScope(ownerId, 'MATCHING', session);
    if (!scope) fail('ASSESSMENT_COMPARISON_UNAVAILABLE', 'Сравнение сейчас недоступно. Проверьте свои разрешения и актуальность данных.');
    const stored = await AssessmentComparison.findById(comparisonId(scope.pairId, ownerId)).session(session).lean<AssessmentComparisonType | null>();
    const parsedCurrent = AssessmentCurrentComparisonSchema.safeParse(stored?.current);
    if (mutation.action === 'scenario' && (!stored || stored.revision !== mutation.expectedComparisonRevision
      || !validStoredEnvelope(stored.envelope, scope, ownerId, 'CURRENT') || !parsedCurrent.success
      || parsedCurrent.data.revision !== stored.revision || !assessmentProjectionMatchesEnvelope(parsedCurrent.data, stored.envelope))) fail('ASSESSMENT_COMPARISON_STALE', 'Основание сравнения изменилось. Пересчитайте текущий результат.');
    return { scope, stored };
  });
  if (!captured) return;
  const actionIds: string[] = mutation.action === 'scenario' ? mutation.actionIds : [];
  if (actionIds.some((id) => !captured.scope.problem.changes.some((action) => action.id === id && action.owners.every((actor) => action.willingness[actor] !== 'F')))) fail('ASSESSMENT_ACTION_UNAVAILABLE', 'Сценарное действие недоступно.', 400);
  const limits = { ...DEFAULT_LIMITS, ...hooks.limits };
  const search = mutation.action === 'scenario' ? findConditionalPlans({ ...captured.scope.problem, changes: captured.scope.problem.changes.filter((action) => actionIds.includes(action.id)) }, limits) : null;
  if (search?.kind === 'UNAVAILABLE') fail('ASSESSMENT_COMPARISON_UNAVAILABLE', 'Сравнение сейчас недоступно.');
  const result: EvaluationResult = search
    ? search.current ? { kind: 'RESULT', value: search.current, checks: search.checks } : { kind: 'BUDGET_EXCEEDED', checks: search.checks }
    : evaluateModel(captured.scope.problem, [], limits);
  const completeness = search?.completeness ?? (result.kind === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' as const : 'COMPLETE_WITHIN_LIMITS' as const);
  const capturedEnvelope = envelopeFor(captured.scope, ownerId, { actionIds, limits, completeness });
  await hooks.afterComputed?.();
  await assessmentTransaction(async (session) => {
    const latest = await captureAssessmentComparisonScope(ownerId, 'MATCHING', session);
    if (!latest || !isAssessmentEnvelopeCurrent(capturedEnvelope, envelopeFor(latest, ownerId, { actionIds, limits, completeness }))) fail('ASSESSMENT_COMPARISON_STALE', 'Основание изменилось во время расчёта.');
    await requireIntent(ownerId, mutation.intentToken, session, latest.A.participant.cohortId);
    const previous = await AssessmentOperation.findById(operationId).session(session).lean();
    if (previous) { if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.'); return; }
    const id = comparisonId(latest.pairId, ownerId);
    const stored = await AssessmentComparison.findById(id).session(session).lean<AssessmentComparisonType | null>();
    if ((stored?.revision ?? 0) !== (captured.stored?.revision ?? 0)) fail('ASSESSMENT_COMPARISON_STALE', 'Сравнение изменилось в другой вкладке.');
    const revision = mutation.action === 'scenario' ? stored!.revision : (stored?.revision ?? 0) + 1;
    if (mutation.action === 'scenario') {
      const output = search as SearchResult;
      const planned: Array<{ ids: string[]; result: EvaluationResult }> = output.plans.map((plan) => ({ ids: [...plan.actionIds], result: { kind: 'RESULT', value: plan.after, checks: output.checks } }));
      if (!planned.length) planned.push({ ids: actionIds, result: output.completeness === 'BUDGET_EXCEEDED'
        ? { kind: 'BUDGET_EXCEEDED', checks: output.checks } : result });
      const entries = planned.map((plan) => {
        const dto = scenarioDTO(plan.result, latest, revision, plan.ids, limits, actionIds);
        dto.completeness = output.completeness;
        if (!output.plans.length) {
          dto.status = output.completeness === 'BUDGET_EXCEEDED' ? 'INCOMPLETE' : 'NO_TARGET_PLAN_IN_CATALOG';
          dto.explanation = output.current?.samePlanWorksAcrossWorlds
            ? 'Текущий результат уже поддерживает опубликованный вариант; дополнительный сценарий для достижения этой цели не требуется.'
            : 'В проверенной ограниченной области не найден подтверждённый общий сценарий. Это не доказательство невозможности других решений; при неполноте поиска вывод остаётся открытым.';
        }
        return { envelope: envelopeFor(latest, ownerId, { actionIds: plan.ids, searchActionIds: actionIds, limits, completeness: output.completeness }), dto };
      });
      const scenarios = [...stored!.scenarios.filter((item) => !entries.some((entry) => entry.dto.id === item.dto.id)), ...entries].slice(-12);
      await AssessmentComparison.updateOne({ _id: id, revision }, { $set: { scenarios } }, { session });
    } else {
      await AssessmentComparison.updateOne({ _id: id }, { $set: { ownerId, pairId: latest.pairId, actorIds: latest.pairMembers, revision, envelope: capturedEnvelope, current: currentDTO(result, latest, revision, limits), scenarios: [] } }, { upsert: true, session });
    }
    await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: revision }], { session });
  });
}

/** Direct owner data remains exportable with the feature off. Shared projections require a fresh consumer context instead. */
export async function exportOwnerAssessmentComparisonData(ownerId: string) {
  await connectToDatabase();
  const row = await AssessmentDirect.findOne({ _id: ownerId, ownerId, status: 'ACTIVE' }).lean<AssessmentDirectType | null>();
  return row ? { revision: row.revision, permissionRevision: row.permissionRevision, period: row.period, answers: row.answers, useForComparison: row.useForComparison, pairUse: row.pairUse } : null;
}

export const assessmentComparisonService = {
  get: getFreshAssessmentComparison,
  controls: (ownerId: string) => readComparison(ownerId, true),
  async mutate(ownerId: string, input: AssessmentComparisonMutation, hooks: AssessmentComparisonHooks = {}): Promise<AssessmentComparisonDTO> {
    const parsed = AssessmentComparisonMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимая операция.', 400);
    const mutation = parsed.data;
    const control = mutation.action === 'revoke' || mutation.action === 'delete-direct' || (mutation.action === 'pair-permission' && !mutation.pairUse);
    await requireAssessmentOwner(ownerId, { control });
    if (mutation.action === 'calculate-current' || mutation.action === 'scenario') await calculate(ownerId, mutation, hooks);
    else await mutateDirect(ownerId, mutation, control);
    return readComparison(ownerId, control);
  },
};
