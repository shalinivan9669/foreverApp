/** Adapted from VMESTE_skill_engine_v0_2/src/rubrics.ts.
 * Runtime parser inputs deliberately use unknown: callers may pass untrusted JSON;
 * each parser validates shape and values before constructing a domain type.
 * No implicit any or assertion of unvalidated client data is introduced.
 */
import type {SkillRubric, DecisionPolicy} from './core';
// Illustrative release policy, NOT an empirical mastery cutoff or confidence level.
export const DEMO_POLICY:DecisionPolicy={minAssessed:4,minFamilies:2,requiredRateNumerator:3,requiredRateDenominator:4,status:'AUTHOR_POLICY_NOT_CALIBRATED'};
function rubric(skillId:string,first:readonly string[],second:readonly string[],third:readonly string[]):SkillRubric{
  const prefix=(keys:readonly string[])=>keys.map(k=>`${skillId}:${k}`);
  return {skillId,version:'0.2.0-demo',status:'AUTHOR_RUBRIC_NOT_VALIDATED',policy:DEMO_POLICY,
    cumulativeFacts:[prefix(first),prefix([...first,...second]),prefix([...first,...second,...third])]};
}
export const REQUEST_RUBRIC=rubric('COM.S02',
 ['specificAction'],
 ['contextOrTimeClear','requestFeasible','otherMayDeclineOrPropose'],
 ['competingInterestsConsidered','alternativeFeasible','coreRequestPreserved']);
export const HOUSEHOLD_RUBRIC=rubric('DOM.S07',
 ['taskNoticed','agreedPartOrganised'],
 ['planned','completionOrganised','resultChecked','planningNotSilentlyOffloaded'],
 ['changeAnticipated','resourcePlanAdapted','helpAgreedIfNeeded']);
export const PAUSE_RUBRIC=rubric('COM.S04',
 ['pauseCommunicated','noThreatOrCoercion'],
 ['returnMethodAgreed','returnTimeOrConditionAgreed'],
 ['overloadConditionsIdentified','conversationProcessAdapted']);
export const RUBRICS=[REQUEST_RUBRIC,HOUSEHOLD_RUBRIC,PAUSE_RUBRIC] as const;
