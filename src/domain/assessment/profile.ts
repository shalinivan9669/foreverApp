import negativeCatalog from './catalog/negative_patterns.v0_2.json';
import originalCatalog from './catalog/original_catalog.v0_1.json';
import {
  canonicalRoots, evaluatePattern, evaluateSkill, parseExpr,
  type Observation, type PatternDefinition, type Phase, type Scope, type SkillRubric, type Track,
} from './engine/core';
import { RUBRICS } from './engine/rubrics';
import type { AssessmentAnswerRecord, AssessmentPeriod, AssessmentPublication } from './contracts';
import { assessmentResponseFacts, DOM_S07_PUBLICATION, isAssessmentItemAvailable, validateAssessmentPublication } from './publication';

export interface AssessmentTrackSnapshot {
  status: 'UNKNOWN' | 'PARTIAL' | 'SUPPORTED' | 'INCONSISTENT';
  method: Track; phase: Phase; observationCount: number;
  exactLevel: number | null; possibleLevels: number[];
  result: ReturnType<typeof evaluateSkill>;
  phases: Array<{ phase: Phase; observationCount: number; result: ReturnType<typeof evaluateSkill> }>;
}
export interface AssessmentSkillSnapshot {
  skillId: string; name: string; status: 'UNKNOWN' | 'PARTIAL' | 'SUPPORTED';
  K: AssessmentTrackSnapshot; D: AssessmentTrackSnapshot; A: AssessmentTrackSnapshot;
  CMinus: ReturnType<typeof evaluatePattern>;
  NMinus: ReturnType<typeof evaluatePattern>[];
  evidenceSource: 'AUTHORED_TASK_AND_STRUCTURED_SELF_REPORT';
  rubricVersion: string; validationStatus: 'AUTHOR_RUBRIC_NOT_VALIDATED';
}
export interface AssessmentProfileSnapshot {
  schemaVersion: 'assessment-profile-v1'; sourceId: string; revision: number; generation: number;
  observationRound: number;
  period: AssessmentPeriod; publicationId: string; publicationVersion: string;
  contextKey: string; policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED';
  skills: AssessmentSkillSnapshot[];
  participation: Array<{ itemId: string; state: 'ANSWERED' | 'NOT_PRESENTED' | 'SKIPPED' | 'NO_EXPERIENCE' | 'NO_OPPORTUNITY' | 'UNCLEAR' }>;
}
export interface ComputeAssessmentProfileInput {
  subjectId: string; sourceId: string; revision: number; generation: number; period: AssessmentPeriod;
  answers: readonly AssessmentAnswerRecord[]; publication?: AssessmentPublication;
  observationRound?: number;
}
const phases: Phase[] = ['BASELINE', 'ASSISTED', 'FOLLOWUP'];
const patternIds = ['NEG.AGR.01', 'NEG.DOM.01', 'NEG.DOM.03'];
const patterns: PatternDefinition[] = patternIds.map(id => {
  const definition = negativeCatalog.patterns.find(pattern => pattern.id === id);
  if (!definition) throw new Error('ASSESSMENT_PATTERN_UNAVAILABLE');
  return { id, predicate: parseExpr(definition.predicate), impactKind: definition.impactKind, protectiveRouteOnReportedMatch: definition.protectiveRouteOnReportedMatch };
});
const skillNames: Record<string, string> = {
  'DOM.S07': 'Полный цикл бытовой ответственности', 'COM.S02': 'Конкретная просьба', 'COM.S04': 'Пауза и возврат к трудному разговору',
};
function latestAnswers(answers: readonly AssessmentAnswerRecord[]): AssessmentAnswerRecord[] {
  const current = new Map<string, AssessmentAnswerRecord>();
  for (const answer of answers) {
    const previous = current.get(answer.itemId);
    if (previous && previous.revision === answer.revision && JSON.stringify(previous.response) !== JSON.stringify(answer.response)) throw new Error('ASSESSMENT_REVISION_COLLISION');
    if (!previous || previous.revision <= answer.revision) current.set(answer.itemId, answer);
  }
  return [...current.values()];
}
function validatePeriod(period: AssessmentPeriod): void {
  const start = Date.parse(period.startsAt), end = Date.parse(period.endsAt);
  if (!period.id || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('ASSESSMENT_INVALID_PERIOD');
}
/** Pure adapter accepts only server-bound current answers. No legacy factor conversion. */
export function computeAssessmentProfile(input: ComputeAssessmentProfileInput): AssessmentProfileSnapshot {
  const publication = validateAssessmentPublication(input.publication ?? DOM_S07_PUBLICATION);
  validatePeriod(input.period);
  const answers = latestAnswers(input.answers);
  const observations: Observation[] = [];
  const participation: AssessmentProfileSnapshot['participation'] = [];
  for (const item of publication.items) {
    const answer = answers.find(record => record.itemId === item.id);
    if (!answer || !isAssessmentItemAvailable(item, answers)) {
      participation.push({ itemId: item.id, state: 'NOT_PRESENTED' });
      continue;
    }
    participation.push({ itemId: item.id, state: answer.response.kind === 'MISSING' ? answer.response.reason : 'ANSWERED' });
    if (answer.response.kind === 'MISSING') continue;
    const facts = assessmentResponseFacts(item, answer.response);
    const parent = item.dependsOn ? publication.items.find(candidate => candidate.id === item.dependsOn?.itemId) : null;
    const parentAnswer = parent ? answers.find(candidate => candidate.itemId === parent.id) : null;
    // Applicability is trusted context from the currently selected parent, not
    // evidence of competence. Carry it into a corrected child's own phase.
    const parentEligibility = parent && parentAnswer ? assessmentResponseFacts(parent, parentAnswer.response)['DOM.S07:eligible'] : undefined;
    const eligible = item.method === 'SELF_REPORT'
      ? { ...facts, ...(parentEligibility ? { 'DOM.S07:eligible': parentEligibility } : {}) }
      : { ...facts, 'DOM.S07:eligible': 'T' as const };
    observations.push({
      subjectId: input.subjectId, contextKey: publication.contextKey, windowId: input.period.id,
      track: item.method, phase: answer.phase, instrumentVersion: publication.version,
      sourceId: `${input.sourceId}:round:${input.observationRound ?? 0}:${item.id}:${answer.phase}`, revision: answer.revision,
      rootId: `${input.subjectId}:${input.period.id}:round:${input.observationRound ?? 0}:${item.rootSlot}`, familyId: item.familyId,
      measureIds: item.method === 'SELF_REPORT' ? ['DOM.S07', ...patternIds] : ['DOM.S07'], facts: eligible,
    });
  }
  const scopeFor = (track: Track, phase: Phase): Scope => ({
    subjectId: input.subjectId, contextKey: publication.contextKey, windowId: input.period.id,
    track, phase, instrumentVersion: publication.version,
  });
  function component(rubric: SkillRubric, method: Track): AssessmentTrackSnapshot {
    const phaseResults = phases.map(phase => {
      const roots = canonicalRoots(observations, scopeFor(method, phase));
      return { phase, observationCount: roots.filter(root => root.measureIds.includes(rubric.skillId)).length, result: evaluateSkill(roots, rubric) };
    });
    // Assisted answers remain separate and can never silently strengthen baseline.
    const selected = phaseResults.find(value => value.phase === 'FOLLOWUP' && value.observationCount > 0)
      ?? phaseResults.find(value => value.phase === 'BASELINE' && value.observationCount > 0)
      ?? phaseResults.find(value => value.phase === 'ASSISTED' && value.observationCount > 0) ?? phaseResults[0];
    return {
      method, phase: selected.phase, observationCount: selected.observationCount,
      status: selected.result.status === 'INCONSISTENT_EVIDENCE' ? 'INCONSISTENT' : selected.result.exactLevel !== null ? 'SUPPORTED' : selected.observationCount > 0 ? 'PARTIAL' : 'UNKNOWN',
      exactLevel: selected.result.exactLevel, possibleLevels: selected.result.possibleLevels, result: selected.result,
      phases: phaseResults,
    };
  }
  const skills = RUBRICS.map(rubric => {
    const K = component(rubric, 'KNOWLEDGE'), D = component(rubric, 'TASK'), A = component(rubric, 'SELF_REPORT');
    const scope = scopeFor('SELF_REPORT', A.phase);
    const roots = rubric.skillId === 'DOM.S07' ? canonicalRoots(observations, scope) : [];
    return {
      skillId: rubric.skillId, name: skillNames[rubric.skillId],
      status: [K, D, A].some(value => value.status === 'SUPPORTED') ? 'SUPPORTED' as const : [K, D, A].some(value => value.observationCount > 0) ? 'PARTIAL' as const : 'UNKNOWN' as const,
      K, D, A, CMinus: evaluatePattern(roots, patterns[0], scope), NMinus: patterns.slice(1).map(pattern => evaluatePattern(roots, pattern, scope)),
      evidenceSource: 'AUTHORED_TASK_AND_STRUCTURED_SELF_REPORT' as const,
      rubricVersion: rubric.version, validationStatus: rubric.status,
    };
  });
  return {
    schemaVersion: 'assessment-profile-v1', sourceId: input.sourceId, revision: input.revision, generation: input.generation,
    observationRound: input.observationRound ?? 0,
    period: input.period, publicationId: publication.id, publicationVersion: publication.version,
    contextKey: publication.contextKey, policyStatus: publication.policyStatus, skills, participation,
  };
}

/** Original definitions remain available for the unoperationalized catalogue. */
export function getAssessmentSkillAvailability(skillId: string) {
  const definition = originalCatalog.skills.find(parameter => parameter.id === skillId);
  if (!definition) return null;
  return {
    definition, availableRubric: RUBRICS.some(rubric => rubric.skillId === skillId),
    status: RUBRICS.some(rubric => rubric.skillId === skillId) ? 'DRAFT_RUBRIC' as const : 'UNKNOWN' as const,
    reason: RUBRICS.some(rubric => rubric.skillId === skillId) ? null : 'UNAVAILABLE_RUBRIC' as const,
  };
}
