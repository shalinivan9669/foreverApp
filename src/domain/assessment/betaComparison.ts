import { allFacts, type Truth } from './engine/core';
import { parseProblem, skillAtLeast, type Change, type EvaluationResult, type Problem } from './engine/matching';
import type { BetaComparisonResultDTO, BetaDirectPlan } from '@/lib/dto/assessmentBeta.dto';
import type { AssessmentProfileSnapshot } from './profile';
import { betaIntervalsOverlap } from './schedule';

export const BETA_COMPARISON_VERSION = 'beta-two-templates-v1';
export const BETA_COMPARISON_LIMITS = { maxWorlds: 1024, maxChecks: 200000, maxActionSets: 64, maxActionsPerSet: 5 };
const truth = (value: boolean | null): Truth => value === null ? 'U' : value ? 'T' : 'F';
const fact = (key: string) => ({ op: 'FACT' as const, key });
const and = (...values: Truth[]): Truth => values.includes('F') ? 'F' : values.includes('U') ? 'U' : 'T';
export function betaAppliedPredicate(snapshot: AssessmentProfileSnapshot | null, skillId: string): Truth {
  const skill = snapshot?.skills.find(value => value.skillId === skillId);
  if (!skill || skill.A.status === 'UNKNOWN' || skill.A.status === 'INCONSISTENT' || skill.A.phase === 'ASSISTED' || skill.A.observationCount === 0 || skill.A.provenance?.freshness === 'EXPIRED'
    || skill.A.possibleLevels.length === 0 || skill.A.possibleLevels.some(value => !Number.isInteger(value) || value < 0 || value > 3)) return 'U';
  return skillAtLeast(skill.A.possibleLevels, 2);
}
function offerFits(need: BetaDirectPlan, offer: BetaDirectPlan['offer']): Truth {
  if (offer === null) return 'U';
  if (need.excludedOffers.includes(offer)) return 'F';
  return need.acceptableOffers === null ? 'U' : truth(need.acceptableOffers.includes(offer));
}
function channelFits(need: BetaDirectPlan, channel: BetaDirectPlan['offeredChannel']): Truth {
  return need.templateId !== 'COM.S04' ? 'T' : !channel || need.acceptableChannels == null ? 'U' : truth(need.acceptableChannels.includes(channel));
}
function conversationTerms(need: BetaDirectPlan, own: BetaDirectPlan): Truth {
  if (need.templateId !== 'COM.S04') return 'T';
  const privacy = !need.conversationPrivacy?.required || !own.conversationPrivacy?.offered ? 'U'
    : truth(need.conversationPrivacy.required === 'EITHER' || own.conversationPrivacy.offered === 'PRIVATE');
  const notice = !own.pauseReturn?.notice || need.pauseReturn?.acceptableNotices == null ? 'U' : truth(need.pauseReturn.acceptableNotices.includes(own.pauseReturn.notice));
  const returnTime = own.pauseReturn?.returnMinutes == null || need.pauseReturn?.acceptableReturnMinutes == null ? 'U'
    : truth(own.pauseReturn.returnMinutes >= need.pauseReturn.acceptableReturnMinutes.min && own.pauseReturn.returnMinutes <= need.pauseReturn.acceptableReturnMinutes.max);
  return and(privacy, notice, returnTime, truth(own.pauseReturn?.allowRevision ?? null));
}
/** Inputs are own direct declarations and purpose-resolved observations, never owner aggregates or runtime fixtures. */
export function buildBetaComparisonProblem(input: {
  identity: string; mode: 'MATCHING' | 'PAIR'; A: BetaDirectPlan; B: BetaDirectPlan;
  appliedA: Truth; appliedB: Truth; allowComputedCriteria: boolean;
}): Problem {
  const { A, B } = input;
  const skillA = B.requireAppliedCriterion ? (input.allowComputedCriteria ? input.appliedA : 'U') : 'T';
  const skillB = A.requireAppliedCriterion ? (input.allowComputedCriteria ? input.appliedB : 'U') : 'T';
  const time = betaIntervalsOverlap(A.availableIntervals, B.availableIntervals) ? 'T' : A.calendarComplete && B.calendarComplete ? 'F' : 'U';
  const changes: Change[] = [];
  for (const actor of ['A', 'B'] as const) {
    const own = actor === 'A' ? A : B, peer = actor === 'A' ? B : A;
    const applied = actor === 'A' ? skillA : skillB;
    if (input.allowComputedCriteria && peer.requireAppliedCriterion && applied === 'F' && own.criterionAttemptMinutes !== null) changes.push({
      id: `${actor}_CRITERION`, label: 'При достижении запрошенного критерия в новом отдельном наблюдении', owners: [actor],
      effects: { [`${actor}Criterion`]: 'T' }, precondition: fact('sameTemplate'), costs: { [`${actor}Minutes`]: own.criterionAttemptMinutes },
      willingness: { A: actor === 'A' ? truth(own.willingCriterion) : 'U', B: actor === 'B' ? truth(own.willingCriterion) : 'U' }, prerequisites: [],
      verification: 'Новое допустимое наблюдение применения по опубликованной рубрике. Бюджет попытки не является сроком освоения.', interpretation: 'ASSUMED_OUTCOME_NOT_FORECAST',
    });
    // An organizational alternative changes only the owner's OFFER; no skill reward or transferred burden.
    const alternativeOffer = own.alternativeOffer ?? own.offer;
    const alternativeChannel = own.alternativeChannel ?? own.offeredChannel;
    if ((alternativeOffer !== own.offer || alternativeChannel !== own.offeredChannel) && own.organizationAttemptMinutes !== null && and(offerFits(peer, alternativeOffer), channelFits(peer, alternativeChannel)) === 'T') changes.push({
      id: `${actor}_ORGANIZE`, label: 'Добровольный иной способ организации в пределах своего предложения', owners: [actor],
      effects: { [`${actor}OfferFits`]: 'T' }, precondition: fact('sameTemplate'), costs: { [`${actor}Minutes`]: own.organizationAttemptMinutes },
      willingness: { A: actor === 'A' ? truth(own.willingAlternative) : 'U', B: actor === 'B' ? truth(own.willingAlternative) : 'U' }, prerequisites: [],
      verification: 'Автор отдельно выбирает предложенный способ организации; необходимые работы и ограничения сохраняются.', interpretation: 'ASSUMED_OUTCOME_NOT_FORECAST',
    });
  }
  if (A.scheduleAttemptMinutes !== null && B.scheduleAttemptMinutes !== null && betaIntervalsOverlap(A.alternativeIntervals, B.alternativeIntervals)) changes.push({
    id: 'JOINT_SCHEDULE', label: 'Оба добровольно выбирают общий допустимый альтернативный интервал', owners: ['A', 'B'], effects: { timeFits: 'T' },
    precondition: fact('sameTemplate'), costs: { AMinutes: A.scheduleAttemptMinutes, BMinutes: B.scheduleAttemptMinutes },
    willingness: { A: truth(A.willingSchedule), B: truth(B.willingSchedule) }, prerequisites: [],
    verification: 'Два независимых согласия на конкретное время. Изменение интервала не увеличивает общий ресурс.', interpretation: 'ASSUMED_OUTCOME_NOT_FORECAST',
  });
  const fitsA = and(offerFits(B, A.offer), channelFits(B, A.offeredChannel)), fitsB = and(offerFits(A, B.offer), channelFits(A, B.offeredChannel));
  const allowedA = and(A.offer === null ? 'U' : truth(!B.excludedOffers.includes(A.offer)), conversationTerms(B, A));
  const allowedB = and(B.offer === null ? 'U' : truth(!A.excludedOffers.includes(B.offer)), conversationTerms(A, B));
  return parseProblem({
    publicationId: `${BETA_COMPARISON_VERSION}:${A.templateId}`,
    snapshot: { id: input.identity, revision: 1, permissionRevision: 1, context: `direct-task:${A.templateId}`, mode: input.mode, gate: 'AVAILABLE', values: {
      sameTemplate: truth(A.templateId === B.templateId), AOfferFits: fitsA, BOfferFits: fitsB,
      AAllowed: allowedA, BAllowed: allowedB, AWilling: truth(A.willingness), BWilling: truth(B.willingness),
      ACriterion: skillA, BCriterion: skillB, timeFits: time,
    } },
    factDefinitions: [
      { id: 'sameTemplate', kind: 'FIXED_POSITION', owner: 'JOINT', domain: 'TASK' },
      ...(['A', 'B'] as const).flatMap(actor => [
        { id: `${actor}OfferFits`, kind: 'OFFER', owner: actor, domain: A.templateId },
        { id: `${actor}Allowed`, kind: 'BOUNDARY', owner: actor, domain: A.templateId },
        { id: `${actor}Willing`, kind: 'FIXED_POSITION', owner: actor, domain: A.templateId },
        { id: `${actor}Criterion`, kind: 'SKILL', owner: actor, domain: A.templateId },
      ]), { id: 'timeFits', kind: 'COORDINATION', owner: 'JOINT', domain: 'TIME' },
    ],
    requirements: [
      { id: 'sameTask', domain: 'TASK', direction: 'BOTH', tier: 'MUST', predicate: fact('sameTemplate') },
      { id: 'AOffer', domain: A.templateId, direction: 'B_FROM_A', tier: B.conditionImportance, predicate: allFacts(['AOfferFits', 'ACriterion']) },
      { id: 'BOffer', domain: A.templateId, direction: 'A_FROM_B', tier: A.conditionImportance, predicate: allFacts(['BOfferFits', 'BCriterion']) },
      { id: 'AConsent', domain: A.templateId, direction: 'B_FROM_A', tier: 'MUST', predicate: allFacts(['AAllowed', 'AWilling']) },
      { id: 'BConsent', domain: A.templateId, direction: 'A_FROM_B', tier: 'MUST', predicate: allFacts(['BAllowed', 'BWilling']) },
      { id: 'schedule', domain: 'TIME', direction: 'BOTH', tier: 'IMPORTANT', predicate: fact('timeFits') },
    ],
    resources: (['A', 'B'] as const).map(actor => { const plan = actor === 'A' ? A : B; return { id: `${actor}Minutes`, owner: actor, unit: 'minute', period: `${plan.period.startsAt}/${plan.period.endsAt}:${plan.resource.lineageId}`, capacity: plan.resource.capacity }; }),
    configurations: [{ id: 'declared-organization', choices: {}, precondition: fact('sameTemplate'), use: { AMinutes: (A.resource.basis === 'TOTAL' ? A.resource.ordinaryUse : 0) + (A.personalTime?.basis === 'INCLUDED_IN_CAPACITY' ? A.personalTime.minMinutes : 0), BMinutes: (B.resource.basis === 'TOTAL' ? B.resource.ordinaryUse : 0) + (B.personalTime?.basis === 'INCLUDED_IN_CAPACITY' ? B.personalTime.minMinutes : 0) } }],
    worldConstraints: [], changes, target: { importantNumerator: 1, importantDenominator: 1, status: 'AUTHOR_POLICY_NOT_VALIDATED' },
  });
}
export function betaComparisonResult(result: EvaluationResult, problem: Problem, hypothetical = false): BetaComparisonResultDTO {
  const evaluation = result.kind === 'RESULT' ? result.value : null;
  const directional = (actor: 'A' | 'B') => {
    const ids = problem.requirements.filter(requirement => requirement.tier !== 'PREFERENCE' && (requirement.direction === 'BOTH' || requirement.direction === (actor === 'A' ? 'A_FROM_B' : 'B_FROM_A'))).map(requirement => requirement.id);
    if (!evaluation) return 'UNRESOLVED';
    if (evaluation.plans.some(plan => ids.every(id => plan.requirementStatus[id] === 'T'))) return 'SUPPORTED';
    return evaluation.plans.every(plan => ids.some(id => plan.requirementStatus[id] === 'F')) ? 'NOT_SUPPORTED' : 'UNRESOLVED';
  };
  const statuses = evaluation?.plans[0]?.requirementStatus ?? {};
  return { kind: hypothetical ? 'HYPOTHETICAL' : 'CURRENT', status: evaluation?.status ?? 'INCOMPLETE', directions: { A_FROM_B: directional('A'), B_FROM_A: directional('B') },
    resourceStatus: evaluation?.plans.some(plan => plan.resourceStatus === 'T') ? 'SUPPORTED' : evaluation?.plans.every(plan => plan.resourceStatus === 'F') ? 'NOT_SUPPORTED' : 'UNRESOLVED',
    completeness: result.kind === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : 'COMPLETE_WITHIN_LIMITS',
    matchedKnown: Object.values(statuses).filter(value => value === 'T').length, considered: problem.requirements.length,
    explanation: 'Вывод ограничен выбранной задачей, разрешёнными прямыми условиями и указанным периодом. Неизвестность не означает недостаток навыка; ресурс проверяется отдельно. Авторская рубрика и самоотчёт не предсказывают качество отношений.',
  };
}
