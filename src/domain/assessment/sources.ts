import { createHash } from 'node:crypto';
import { canonicalRoots, evaluatePattern, evaluateSkill, type Observation, type Scope, type Track } from './engine/core';
import { RUBRICS } from './engine/rubrics';
import { ASSESSMENT_PATTERNS, assessmentObservations, computeAssessmentProfile, type AssessmentProfileSnapshot, type AssessmentTrackSnapshot, type ComputeAssessmentProfileInput } from './profile';
import type { AssessmentPublication, AssessmentPurpose } from './contracts';

export interface AssessmentCompositionSource extends ComputeAssessmentProfileInput {
  publication: AssessmentPublication; finalizedAt: string; permissionRevision: number;
  pairUse: boolean; matchingUse: boolean; contextIdentity: string;
}
export function isSourceEligibleForPurpose(source: AssessmentCompositionSource, purpose: AssessmentPurpose, relationshipId?: string): boolean {
  if (purpose === 'OWNER') return true;
  if (source.publication.metadata && !source.publication.metadata.allowedPurposes.includes(purpose)) return false;
  if (purpose === 'MATCHING' && !source.matchingUse || purpose === 'PAIR' && !source.pairUse) return false;
  // An individual context may be deliberately disclosed. A relationship context
  // is never silently portable to matching or to a different relationship.
  return source.contextIdentity === 'INDIVIDUAL' || purpose === 'PAIR' && source.contextIdentity === `PAIR:${relationshipId}`;
}
export function assessmentSourceSetIdentity(sources: readonly AssessmentCompositionSource[], purpose: AssessmentPurpose): string {
  const entries = sources.map(source => purpose === 'OWNER' ? [source.sourceId, source.revision, source.generation, source.permissionRevision, source.publication.id, source.publication.version, source.contextIdentity]
    : [source.sourceId, source.generation, source.permissionRevision, source.publication.id, source.publication.version, source.contextIdentity, source.period,
      assessmentObservations(source).observations.map(observation => [observation.rootId, observation.familyId, observation.phase, observation.track, Object.entries(observation.facts).filter(([key]) => !key.startsWith('NEG.')).sort(([a], [b]) => a.localeCompare(b))])]);
  return createHash('sha256').update(JSON.stringify([purpose, entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])))])).digest('hex');
}
/** Inputs must already pass current participant/publication eligibility. Purpose
 * is applied again BEFORE facts or sufficiency are evaluated, never after owner aggregation. */
export function composeAssessmentSources(sources: readonly AssessmentCompositionSource[], options: { purpose: AssessmentPurpose; sourceSetRevision: number; relationshipId?: string; now?: Date }): AssessmentProfileSnapshot | null {
  const allowed = sources.filter(source => isSourceEligibleForPurpose(source, options.purpose, options.relationshipId));
  if (!allowed.length) return null;
  if (allowed.length > 160) throw new Error('ASSESSMENT_SOURCE_BUDGET_EXCEEDED');
  const now = options.now ?? new Date();
  const latest = [...allowed].sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt) || a.sourceId.localeCompare(b.sourceId))[0];
  const base = computeAssessmentProfile(latest);
  const groups = new Map<string, { sources: AssessmentCompositionSource[]; observations: Observation[]; scope: Scope }>();
  for (const source of allowed) {
    const { observations } = assessmentObservations(source);
    for (const method of new Set(source.publication.items.map(item => item.method))) {
      const scope: Scope = { subjectId: source.subjectId, contextKey: `${source.publication.contextKey}:${source.contextIdentity}`, windowId: source.period.id, track: method, phase: 'BASELINE', instrumentVersion: source.publication.metadata?.compatibilityKey ?? source.publication.version };
      const key = JSON.stringify([source.publication.skillId, scope.contextKey, source.period.startsAt, source.period.endsAt, scope.windowId, method, source.publication.rubricVersion, scope.instrumentVersion]);
      const group = groups.get(key) ?? { sources: [], observations: [], scope };
      group.sources.push(source);
      group.observations.push(...observations.filter(observation => observation.track === method).map(observation => options.purpose === 'OWNER' ? observation : ({ ...observation, measureIds: observation.measureIds.filter(id => !id.startsWith('NEG.')), facts: Object.fromEntries(Object.entries(observation.facts).filter(([key]) => !key.startsWith('NEG.'))) })));
      groups.set(key, group);
    }
  }
  base.skills = RUBRICS.map(rubric => {
    const empty = computeAssessmentProfile({ ...latest, answers: [] }).skills.find(skill => skill.skillId === rubric.skillId)!;
    const selectedGroups = new Map<Track, typeof groups extends Map<string, infer V> ? V : never>();
    function component(method: Track): AssessmentTrackSnapshot {
      const matching = [...groups.values()].filter(group => group.sources[0].publication.skillId === rubric.skillId && group.scope.track === method)
        .sort((a, b) => b.sources[0].period.endsAt.localeCompare(a.sources[0].period.endsAt) || Math.max(...b.sources.map(source => Date.parse(source.finalizedAt))) - Math.max(...a.sources.map(source => Date.parse(source.finalizedAt))));
      const assessments = matching.map(group => {
        const phaseResults = (['BASELINE', 'ASSISTED', 'FOLLOWUP'] as const).map(phase => {
          const roots = canonicalRoots(group.observations, { ...group.scope, phase });
          return { phase, observationCount: roots.filter(root => root.measureIds.includes(rubric.skillId)).length, result: evaluateSkill(roots, rubric), roots };
        });
        const selected = phaseResults.find(phase => phase.phase === 'FOLLOWUP' && phase.observationCount) ?? phaseResults.find(phase => phase.phase === 'BASELINE' && phase.observationCount) ?? phaseResults.find(phase => phase.phase === 'ASSISTED' && phase.observationCount) ?? phaseResults[0];
        return { group, selected, phaseResults };
      });
      const value = assessments[0];
      if (!value) return method === 'KNOWLEDGE' ? empty.K : method === 'TASK' ? empty.D : empty.A;
      const { group, selected, phaseResults } = value;
      selectedGroups.set(method, group);
      const source = group.sources[0];
      const expired = !!source.publication.metadata && Date.parse(source.period.endsAt) + source.publication.metadata.freshnessDays * 86400000 < now.getTime();
      const result = expired ? evaluateSkill([], rubric) : selected.result;
      const dates = group.sources.flatMap(source => source.answers.flatMap(answer => answer.response.kind === 'FACTS' && answer.response.episode ? [answer.response.episode.observedAt] : [])).sort();
      return {
        method, phase: selected.phase, observationCount: expired ? 0 : selected.observationCount, result,
        status: expired ? 'UNKNOWN' : result.status === 'INCONSISTENT_EVIDENCE' ? 'INCONSISTENT' : result.exactLevel !== null ? 'SUPPORTED' : selected.observationCount ? 'PARTIAL' : 'UNKNOWN',
        exactLevel: result.exactLevel, possibleLevels: result.possibleLevels, phases: phaseResults.map(({ phase, observationCount, result }) => ({ phase, observationCount, result })),
        provenance: { sourceIds: group.sources.map(source => source.sourceId), sourceRevisions: group.sources.map(source => source.revision), period: source.period, contextIdentity: source.contextIdentity, samplingFrame: source.publication.metadata?.samplingFrame ?? 'SELECTED_DESCRIBED_EPISODES', lastObservedAt: dates.at(-1) ?? null, freshness: expired ? 'EXPIRED' : 'CURRENT', componentVersion: assessmentSourceSetIdentity(group.sources, options.purpose), disputedFactCount: selected.roots.reduce((count, root) => count + root.disputedKeys.length, 0), exposureHistory: group.sources.some(source => source.exposureHistory === 'UNKNOWN_AFTER_DELETION') ? 'UNKNOWN_AFTER_DELETION' : source.exposureHistory },
        history: assessments.map(entry => ({ period: entry.group.sources[0].period, contextIdentity: entry.group.sources[0].contextIdentity, exactLevel: entry.selected.result.exactLevel, possibleLevels: entry.selected.result.possibleLevels, sourceIds: entry.group.sources.map(source => source.sourceId), phase: entry.selected.phase, comparable: entry.group.scope.contextKey === group.scope.contextKey && entry.group.scope.instrumentVersion === group.scope.instrumentVersion })),
      };
    }
    const K = component('KNOWLEDGE'), D = component('TASK'), A = component('SELF_REPORT');
    const applied = selectedGroups.get('SELF_REPORT');
    const negativeScope = { ...(applied?.scope ?? { subjectId: latest.subjectId, contextKey: latest.publication.contextKey, windowId: latest.period.id, track: 'SELF_REPORT' as const, instrumentVersion: latest.publication.version }), phase: A.phase };
    const negativeRoots = applied && options.purpose === 'OWNER' ? canonicalRoots(applied.observations, negativeScope) : [];
    const negativeHistory = options.purpose === 'OWNER' ? [...groups.values()].filter(group => group.sources[0].publication.skillId === rubric.skillId && group.scope.track === 'SELF_REPORT').map(group => {
      const phase = group.observations.some(observation => observation.phase === 'FOLLOWUP') ? 'FOLLOWUP' : group.observations.some(observation => observation.phase === 'BASELINE') ? 'BASELINE' : 'ASSISTED';
      const scope = { ...group.scope, phase } as Scope;
      const roots = canonicalRoots(group.observations, scope);
      return { period: group.sources[0].period, contextIdentity: group.sources[0].contextIdentity, CMinus: evaluatePattern(roots, ASSESSMENT_PATTERNS[0], scope), NMinus: ASSESSMENT_PATTERNS.slice(1).map(pattern => evaluatePattern(roots, pattern, scope)) };
    }).sort((a, b) => b.period.endsAt.localeCompare(a.period.endsAt)) : [];
    return { ...empty, K, D, A, CMinus: evaluatePattern(negativeRoots, ASSESSMENT_PATTERNS[0], negativeScope), NMinus: ASSESSMENT_PATTERNS.slice(1).map(pattern => evaluatePattern(negativeRoots, pattern, negativeScope)), negativeHistory,
      status: [K, D, A].some(component => component.status === 'SUPPORTED') ? 'SUPPORTED' : [K, D, A].some(component => component.observationCount > 0) ? 'PARTIAL' : 'UNKNOWN' };
  });
  return { ...base, sourceId: allowed.length === 1 ? latest.sourceId : 'COMPOSED', sourceSetRevision: options.sourceSetRevision, sourceSetIdentity: assessmentSourceSetIdentity(allowed, options.purpose), revision: allowed.length === 1 ? latest.revision : options.sourceSetRevision };
}
