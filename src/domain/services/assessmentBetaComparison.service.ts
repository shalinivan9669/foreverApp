import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { BetaComparisonMutationSchema, betaDirectPlanSchema, betaActionSchema, type BetaComparisonDTO, type BetaComparisonMutation, type BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import { betaAppliedPredicate, betaComparisonResult, buildBetaComparisonProblem, BETA_COMPARISON_LIMITS, BETA_COMPARISON_VERSION } from '@/domain/assessment/betaComparison';
import { evaluateModel, findConditionalPlans } from '@/domain/assessment/engine/matching';
import { AssessmentDirect, type AssessmentDirectType } from '@/models/AssessmentDirect';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { Pair } from '@/models/Pair';
import { MatchingBlock } from '@/models/MatchingBlock';
import { SessionSubject } from '@/models/SessionSubject';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { assessmentFail as fail, assessmentTransaction, requireAssessmentOwner, requireAssessmentEffect, assessmentPurposeAllowed } from './assessmentAccess.service';
import { assessmentIdentity, resolveAssessmentSourceView } from './assessmentRuns.service';
import { betaDirectId } from './assessmentDirect.service';
import { getCandidateMatchingCard } from './matching/matchingApplication.service';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const unavailable = (): BetaComparisonDTO => ({ availability: 'UNAVAILABLE', templateId: null, current: null, scenarios: [], availableActions: [] });
type DirectSource = AssessmentDirectType & { betaPlan: BetaDirectPlan };
export async function resolveBetaDirect(ownerId: string, purpose: 'MATCHING' | 'PAIR', session: ClientSession): Promise<DirectSource | null> {
  const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
  if (!assessmentPurposeAllowed(participant, purpose)) return null;
  const source = await AssessmentDirect.findOne({ _id: betaDirectId(ownerId), ownerId, status: 'ACTIVE', deletionGeneration: participant.deletionGeneration,
    ...(purpose === 'MATCHING' ? { betaDiscoveryOptIn: true } : { pairUse: true }) }).session(session).lean<AssessmentDirectType | null>();
  const parsed = betaDirectPlanSchema.safeParse(source?.betaPlan);
  if (!source || !parsed.success || Date.parse(parsed.data.period.endsAt) <= Date.now()) return null;
  return { ...source, betaPlan: parsed.data };
}
async function capture(ownerId: string, candidateId: string | null, session: ClientSession, directOnly: boolean) {
  const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
  const purpose = candidateId ? 'MATCHING' as const : 'PAIR' as const;
  await requireAssessmentEffect(candidateId ? 'MATCHING' : 'PAIR', session);
  const pair = candidateId ? null : await Pair.findOneAndUpdate({ members: ownerId, status: 'active' }, { $currentDate: { updatedAt: true } }, { session, new: true }).lean();
  const peerId = candidateId ?? pair?.members.find(member => member !== ownerId);
  if (!peerId || peerId === ownerId || (!candidateId && pair?.members.length !== 2)) return null;
  const peer = await requireAssessmentOwner(peerId, { session, fence: true });
  if (peer.cohortId !== participant.cohortId) return null;
  if (await MatchingBlock.exists({ status: 'ACTIVE', $or: [{ blockerId: ownerId, blockedId: peerId }, { blockerId: peerId, blockedId: ownerId }] }).session(session)) return null;
  const a = await resolveBetaDirect(ownerId, purpose, session), b = await resolveBetaDirect(peerId, purpose, session);
  if (!a || !b) return null;
  const sourcesA = !directOnly ? await resolveAssessmentSourceView(ownerId, { purpose, relationshipId: pair ? String(pair._id) : undefined, session }) : null;
  const sourcesB = !directOnly ? await resolveAssessmentSourceView(peerId, { purpose, relationshipId: pair ? String(pair._id) : undefined, session }) : null;
  const accounts = await SessionSubject.find({ subjectKey: { $in: [privacySubjectHash(ownerId), privacySubjectHash(peerId)] } }).session(session).select({ subjectKey: 1, version: 1 }).lean();
  if (accounts.length !== 2) return null;
  const identity = assessmentIdentity(BETA_COMPARISON_VERSION, ownerId, peerId, purpose, pair ? `${pair._id}:${pair.lifecycleRevision ?? 0}` : 'discovery',
    JSON.stringify([a.revision, a.permissionRevision, a.deletionGeneration, b.revision, b.permissionRevision, b.deletionGeneration]),
    JSON.stringify([participant.permissionEpoch ?? 0, participant.settingsRevision ?? 0, peer.permissionEpoch ?? 0, peer.settingsRevision ?? 0]),
    JSON.stringify(accounts.map(account => [account.subjectKey, account.version]).sort()), sourcesA?.sourceSetIdentity ?? '', sourcesB?.sourceSetIdentity ?? '');
  const problem = buildBetaComparisonProblem({ identity, mode: purpose === 'MATCHING' ? 'MATCHING' : 'PAIR', A: a.betaPlan, B: b.betaPlan,
    appliedA: betaAppliedPredicate(sourcesA?.snapshot ?? null, a.betaPlan.templateId), appliedB: betaAppliedPredicate(sourcesB?.snapshot ?? null, a.betaPlan.templateId), allowComputedCriteria: !directOnly });
  return { identity, problem, a, b, peerId, templateId: a.betaPlan.templateId,
    envelope: { version: BETA_COMPARISON_VERSION, actors: { A: ownerId, B: peerId }, purpose, audience: 'OWNER' as const, relationshipId: pair ? String(pair._id) : null,
      contextRevision: pair?.lifecycleRevision ?? 0, baseIdentity: identity,
      sources: { A: sourcesA?.sourceSetIdentity ?? null, B: sourcesB?.sourceSetIdentity ?? null },
      sourceSetRevisions: { A: sourcesA?.sourceSetRevision ?? 0, B: sourcesB?.sourceSetRevision ?? 0 },
      consentEpochs: { A: participant.permissionEpoch ?? 0, B: peer.permissionEpoch ?? 0 }, deletionGenerations: { A: participant.deletionGeneration, B: peer.deletionGeneration },
      accountVersions: accounts.map(account => ({ subjectKey: account.subjectKey, version: account.version })),
      directVersions: { A: { revision: a.revision, permission: a.permissionRevision }, B: { revision: b.revision, permission: b.permissionRevision } },
      policyVersion: 'beta-direct-predicate-v1', publicationVersion: problem.publicationId, consumedInputHash: digest(JSON.stringify(problem)),
    } };
}
/** Fresh computation is bounded and is never persisted as actual skill. A second capture fences all valid inputs. */
export async function calculateBetaComparison(ownerId: string, candidateId: string | null, actionIds: string[], directOnly = false, hooks: { afterPrepared?: () => Promise<void> } = {}): Promise<BetaComparisonDTO> {
  const scope = await assessmentTransaction(session => capture(ownerId, candidateId, session, directOnly));
  if (!scope) return unavailable();
  if (actionIds.some(id => !scope.problem.changes.some(action => action.id === id && action.owners.every(actor => action.willingness[actor] !== 'F')))) fail('ASSESSMENT_ACTION_UNAVAILABLE', 'Выбранный вариант недоступен.', 400);
  const current = evaluateModel(scope.problem, [], BETA_COMPARISON_LIMITS);
  const search = findConditionalPlans({ ...scope.problem, changes: scope.problem.changes.filter(action => actionIds.length ? actionIds.includes(action.id) : action.owners.every(actor => action.willingness[actor] !== 'F')) }, BETA_COMPARISON_LIMITS);
  await hooks.afterPrepared?.();
  const fresh = await assessmentTransaction(session => capture(ownerId, candidateId, session, directOnly));
  if (!fresh || fresh.identity !== scope.identity) fail('ASSESSMENT_COMPARISON_STALE', 'Условия изменились во время расчёта. Повторите расчёт.');
  return { availability: 'AVAILABLE', templateId: scope.templateId, current: betaComparisonResult(current, scope.problem),
    availableActions: scope.problem.changes.filter(action => action.owners.every(actor => action.willingness[actor] !== 'F')).map(action => ({ id: betaActionSchema.parse(action.id), label: action.label, requiresChoice: action.owners.some(actor => action.willingness[actor] === 'U'), verification: action.verification })),
    scenarios: search.kind === 'UNAVAILABLE' ? [] : search.plans.map(plan => {
      const actions = scope.problem.changes.filter(action => plan.actionIds.includes(action.id));
      return { actionIds: [...plan.actionIds], result: { ...betaComparisonResult({ kind: 'RESULT', value: plan.after, checks: search.checks }, scope.problem, true), completeness: search.completeness },
        assumptions: actions.map(action => action.label), changesCurrent: false, voluntaryState: actions.some(action => action.owners.some(actor => action.willingness[actor] === 'U')) ? 'MODEL_OPTION_NOT_CHOSEN' : 'DECLARED_OPEN_NOT_AGREED', ownAttemptMinutes: actions.reduce((total, action) => total + (action.costs.AMinutes ?? 0), 0) };
    }) };
}
export const betaComparisonService = {
  async calculate(ownerId: string, input: BetaComparisonMutation): Promise<BetaComparisonDTO> {
    const mutation = BetaComparisonMutationSchema.parse(input);
    await requireAssessmentOwner(ownerId);
    let candidateId: string | null = null;
    if (mutation.candidateGrant) {
      const grant = await CandidatePresentationGrant.findOne({ tokenHash: digest(mutation.candidateGrant), requesterId: ownerId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).lean();
      if (!grant) fail('NOT_FOUND', 'Кандидат сейчас недоступен.', 404);
      candidateId = grant.candidateId;
      await getCandidateMatchingCard({ currentUserId: ownerId, candidateId, candidateGrant: mutation.candidateGrant });
    }
    const result = await calculateBetaComparison(ownerId, candidateId, mutation.actionIds);
    if (candidateId && mutation.candidateGrant) await getCandidateMatchingCard({ currentUserId: ownerId, candidateId, candidateGrant: mutation.candidateGrant });
    return result;
  },
};
