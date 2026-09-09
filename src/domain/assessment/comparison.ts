import { z } from 'zod';
import type { Phase, Track, Truth } from './engine/core';
import { allFacts } from './engine/core';
import { intersectSets, parseProblem, skillAtLeast, type Change, type Problem } from './engine/matching';
import { HOUSEHOLD_RUBRIC } from './engine/rubrics';
import { assessmentWindowSchema, type AssessmentWindow } from './boundaries';

export const ASSESSMENT_COMPARISON_PUBLICATION = 'dom-s07-comparison-v1';
export const ASSESSMENT_COMPARISON_NORMALIZER = 'dom-s07-profile-predicates-v1';
export const ASSESSMENT_RESOURCE_PERIOD_DAYS = 28;
export const ASSESSMENT_MEETING_SLOTS = ['WEEKDAY_EVENING', 'WEEKEND_MORNING', 'WEEKEND_EVENING'] as const;
const minuteAmount = z.number().int().min(0).max(ASSESSMENT_RESOURCE_PERIOD_DAYS * 1440);
const meetingSlots = z.array(z.enum(ASSESSMENT_MEETING_SLOTS)).max(3)
  .refine((value) => new Set(value).size === value.length, 'DUPLICATE_SLOT');

/** The authenticated author answers for themselves. No server facts/effects/actor fields are accepted. */
export const assessmentDirectAnswersSchema = z.object({
  parenthood: z.enum(['WANT_CHILDREN', 'DO_NOT_WANT_CHILDREN']).nullable(),
  relationshipFormat: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE']).nullable(),
  offersShopping: z.boolean().nullable(),
  offersCooking: z.boolean().nullable(),
  acceptableMeetingSlots: meetingSlots.nullable(),
  proposedMeetingSlots: meetingSlots.nullable(),
  capacityMinutes: minuteAmount.nullable(),
  ordinaryTaskMinutes: minuteAmount,
  practiceBudgetMinutes: minuteAmount.nullable(),
  scheduleBudgetMinutes: minuteAmount.nullable(),
  willingPractice: z.boolean().nullable(),
  willingSchedule: z.boolean().nullable(),
}).strict();
export type AssessmentDirectAnswers = z.infer<typeof assessmentDirectAnswersSchema>;

export type AssessmentComparableSkill = {
  readonly skillId: string;
  readonly rubricVersion: string;
  readonly track: Track;
  readonly phase: Phase;
  readonly context: string;
  readonly window: AssessmentWindow;
  readonly possibleLevels: readonly number[];
  readonly status: 'UNKNOWN' | 'RUBRIC_LEVEL' | 'PARTIAL_LEVEL' | 'INCONSISTENT_EVIDENCE';
};
export type AssessmentComparisonParticipant = {
  readonly ownerId: string;
  readonly direct: AssessmentDirectAnswers | null;
  /** Server protection decision; a blocked route is never offset by positive skill. */
  readonly protection: 'ALLOW' | 'BLOCK';
  /** Only CURRENT, purpose-resolved own snapshots are passed by the server service. */
  readonly skills: readonly AssessmentComparableSkill[];
};

export function assessmentAppliedSkillAtLeast(
  skills: readonly AssessmentComparableSkill[],
  context: string,
  window: AssessmentWindow,
  threshold = 2,
): Truth {
  const targetWindow = assessmentWindowSchema.safeParse(window);
  if (!targetWindow.success) return 'U';
  const appropriate = skills.filter((skill) => {
    const candidateWindow = assessmentWindowSchema.safeParse(skill.window);
    return skill.skillId === HOUSEHOLD_RUBRIC.skillId
      && skill.rubricVersion === HOUSEHOLD_RUBRIC.version
      && skill.track === 'SELF_REPORT' && skill.phase !== 'ASSISTED'
      && skill.context === context && candidateWindow.success
      && candidateWindow.data.start === targetWindow.data.start
      && candidateWindow.data.end === targetWindow.data.end
      && candidateWindow.data.definitionVersion === targetWindow.data.definitionVersion;
  });
  if (!appropriate.length || appropriate.some((skill) => skill.status === 'INCONSISTENT_EVIDENCE'
    || !skill.possibleLevels.length || new Set(skill.possibleLevels).size !== skill.possibleLevels.length
    || skill.possibleLevels.some((level) => !Number.isInteger(level) || level < 0 || level > 3))) return 'U';
  const conclusions = appropriate.map((skill) => skill.status === 'UNKNOWN' ? 'U' : skillAtLeast(skill.possibleLevels, threshold));
  // Different appropriate tracks/phases are not pooled into more optimistic evidence.
  return conclusions.every((result) => result === 'T') ? 'T'
    : conclusions.every((result) => result === 'F') ? 'F' : 'U';
}

const truth = (answer: boolean | null): Truth => answer === null ? 'U' : answer ? 'T' : 'F';
const samePosition = (a: string | null, b: string | null): Truth => a === null || b === null ? 'U' : a === b ? 'T' : 'F';
const fact = (key: string) => ({ op: 'FACT' as const, key });

/** Finite server-owned adapter. It cannot authenticate a caller; its service must resolve sources first. */
export function buildAssessmentComparisonProblem(input: {
  readonly snapshotId: string;
  readonly snapshotRevision: number;
  readonly permissionRevision: number;
  readonly mode: 'MATCHING' | 'PAIR';
  readonly context: string;
  readonly window: AssessmentWindow;
  readonly access: 'AVAILABLE' | 'UNAVAILABLE';
  readonly A: AssessmentComparisonParticipant;
  readonly B: AssessmentComparisonParticipant;
}): Problem {
  if (input.A.ownerId === input.B.ownerId) throw new Error('ASSESSMENT_DISTINCT_ACTORS_REQUIRED');
  const window = assessmentWindowSchema.parse(input.window);
  if (Date.parse(window.end) - Date.parse(window.start) !== ASSESSMENT_RESOURCE_PERIOD_DAYS * 86400000) throw new Error('ASSESSMENT_28_DAY_WINDOW_REQUIRED');
  const a = input.A.direct === null ? null : assessmentDirectAnswersSchema.parse(input.A.direct);
  const b = input.B.direct === null ? null : assessmentDirectAnswersSchema.parse(input.B.direct);
  const aSkill = assessmentAppliedSkillAtLeast(input.A.skills, input.context, window);
  const bSkill = assessmentAppliedSkillAtLeast(input.B.skills, input.context, window);
  const period = `${window.start}/${window.end}`;
  const changes: Change[] = [];
  const participants = [{ actor: 'A' as const, direct: a, skill: aSkill }, { actor: 'B' as const, direct: b, skill: bSkill }];
  for (const participant of participants) {
    const { actor, direct, skill } = participant;
    if (direct === null || skill !== 'F' || direct.practiceBudgetMinutes === null) continue;
    changes.push({
      id: `${actor}_demonstrates_full_cycle`,
      label: 'Допущение: в новом отдельном наблюдении поддержан полный цикл бытовой задачи',
      owners: [actor], effects: { [`${actor}fullCycle`]: 'T' }, precondition: fact('technicalPlanAvailable'),
      costs: { [`${actor}_minutes`]: direct.practiceBudgetMinutes },
      willingness: { A: actor === 'A' ? truth(direct.willingPractice) : 'U', B: actor === 'B' ? truth(direct.willingPractice) : 'U' },
      prerequisites: [],
      verification: 'Новое подходящее наблюдение SELF_REPORT; выбранные минуты — бюджет попытки, без обещания срока освоения.',
      interpretation: 'ASSUMED_OUTCOME_NOT_FORECAST',
    });
  }
  if (a !== null && b !== null && a.scheduleBudgetMinutes !== null && b.scheduleBudgetMinutes !== null
    && intersectSets(a.proposedMeetingSlots, b.proposedMeetingSlots).status === 'T') {
    changes.push({
      id: 'joint_schedule', label: 'Допущение: оба выбрали допустимый общий интервал', owners: ['A', 'B'],
      effects: { timeFits: 'T' }, precondition: fact('technicalPlanAvailable'),
      costs: { A_minutes: a.scheduleBudgetMinutes, B_minutes: b.scheduleBudgetMinutes },
      willingness: { A: truth(a.willingSchedule), B: truth(b.willingSchedule) }, prerequisites: [],
      verification: 'Два независимых подтверждения конкретного общего интервала; прежние ограничения сохраняются.',
      interpretation: 'ASSUMED_OUTCOME_NOT_FORECAST',
    });
  }
  return parseProblem({
    publicationId: ASSESSMENT_COMPARISON_PUBLICATION,
    snapshot: {
      id: input.snapshotId, revision: input.snapshotRevision, permissionRevision: input.permissionRevision,
      context: input.context, mode: input.mode,
      gate: input.access === 'AVAILABLE' && input.A.protection === 'ALLOW' && input.B.protection === 'ALLOW' && a !== null && b !== null ? 'AVAILABLE' : 'UNAVAILABLE',
      values: {
        technicalPlanAvailable: 'T',
        sameParenthood: samePosition(a?.parenthood ?? null, b?.parenthood ?? null),
        sameFormat: samePosition(a?.relationshipFormat ?? null, b?.relationshipFormat ?? null),
        AfullCycle: aSkill, BfullCycle: bSkill,
        AoffersCooking: truth(a?.offersCooking ?? null), BoffersShopping: truth(b?.offersShopping ?? null),
        timeFits: intersectSets(a?.acceptableMeetingSlots ?? null, b?.acceptableMeetingSlots ?? null).status,
      },
    },
    factDefinitions: [
      { id: 'technicalPlanAvailable', kind: 'FIXED_POSITION', owner: 'JOINT', domain: 'TECHNICAL' },
      { id: 'sameParenthood', kind: 'FIXED_POSITION', owner: 'JOINT', domain: 'D03' },
      { id: 'sameFormat', kind: 'FIXED_POSITION', owner: 'JOINT', domain: 'D03' },
      { id: 'AfullCycle', kind: 'SKILL', owner: 'A', domain: 'D01' },
      { id: 'BfullCycle', kind: 'SKILL', owner: 'B', domain: 'D01' },
      { id: 'AoffersCooking', kind: 'OFFER', owner: 'A', domain: 'D01' },
      { id: 'BoffersShopping', kind: 'OFFER', owner: 'B', domain: 'D01' },
      { id: 'timeFits', kind: 'COORDINATION', owner: 'JOINT', domain: 'D09' },
    ],
    requirements: [
      { id: 'parenthood', domain: 'D03', direction: 'BOTH', tier: 'MUST', predicate: fact('sameParenthood') },
      { id: 'relationshipFormat', domain: 'D03', direction: 'BOTH', tier: 'MUST', predicate: fact('sameFormat') },
      { id: 'A_need_shopping_cycle', domain: 'D01', direction: 'A_FROM_B', tier: 'MUST', predicate: allFacts(['BfullCycle', 'BoffersShopping']) },
      { id: 'B_need_cooking_cycle', domain: 'D01', direction: 'B_FROM_A', tier: 'MUST', predicate: allFacts(['AfullCycle', 'AoffersCooking']) },
      { id: 'mutualTime', domain: 'D09', direction: 'BOTH', tier: 'IMPORTANT', predicate: fact('timeFits') },
    ],
    resources: [
      { id: 'A_minutes', owner: 'A', unit: 'minute', period, capacity: a?.capacityMinutes ?? null },
      { id: 'B_minutes', owner: 'B', unit: 'minute', period, capacity: b?.capacityMinutes ?? null },
    ],
    // If a whole direct source is missing the gate is UNAVAILABLE, never an assumed zero cost.
    configurations: [{ id: 'A_cooks_B_shops', choices: {}, precondition: fact('technicalPlanAvailable'), use: {
      ...(a === null ? {} : { A_minutes: a.ordinaryTaskMinutes }), ...(b === null ? {} : { B_minutes: b.ordinaryTaskMinutes }),
    } }],
    worldConstraints: [], changes,
    target: { importantNumerator: 1, importantDenominator: 1, status: 'AUTHOR_POLICY_NOT_VALIDATED' },
  });
}
