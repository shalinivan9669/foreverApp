/** Adapted from VMESTE_matching_pair_v0_3/src/discovery.ts.
 * Runtime parser inputs deliberately use unknown: callers may pass untrusted JSON;
 * each parser validates shape and values before constructing a domain type.
 * No implicit any or assertion of unvalidated client data is introduced.
 */
/** Discovery semantics only, not a feed service or a probability model. */
import type {Evaluation, SearchResult} from './matching';
export type Lane='CURRENT_SUPPORTED'|'CONDITIONAL_OPTION'|'CLARIFY_FIRST'|'DECLARED_DIFFERENCE'|'UNAVAILABLE';
export function laneFor(result:SearchResult|{kind:'UNAVAILABLE'}):Lane{
 if(result.kind==='UNAVAILABLE')return 'UNAVAILABLE';
 if(result.current===null||result.completeness==='BUDGET_EXCEEDED')return 'CLARIFY_FIRST';
 if(result.current.samePlanWorksAcrossWorlds)return 'CURRENT_SUPPORTED';
 // A possible current solution is an epistemic gap, not an established personal deficit.
 if(result.current.plans.some(p=>p.possibleTarget))return 'CLARIFY_FIRST';
 if(result.plans.length)return 'CONDITIONAL_OPTION';
 return 'DECLARED_DIFFERENCE';
}
export interface ComparableCard {
 readonly id:string;readonly basisId:string;readonly lane:Lane;
 readonly a:readonly[number,number];readonly b:readonly[number,number];
}
/** Robust Pareto comparison: incompatible bases or overlapping evidence may remain unordered.
 * This must not be turned into a comparator returning 0 for incomparable pairs: incomparability
 * is not transitive. Build a dominance DAG/fronts and rotate ties independently instead.
 */
export function definitelyDominates(a:ComparableCard,b:ComparableCard):boolean{
 if(a.basisId!==b.basisId||a.lane!==b.lane)return false;
 for(const x of [a.a,a.b,b.a,b.b])if(x.some(n=>!Number.isFinite(n))||x[0]>x[1])throw new Error('INVALID_BOUNDS');
 return a.a[0]>=b.a[1]&&a.b[0]>=b.b[1]&&(a.a[0]>b.a[1]||a.b[0]>b.b[1]);
}
export function observedConditionSummary(result:Evaluation,configurationId:string){
 const p=result.plans.find(x=>x.configurationId===configurationId);if(!p)throw new Error('UNKNOWN_CONFIGURATION');
 return {directionA:p.a,directionB:p.b,meaning:'COUNTS_OF_SELECTED_IMPORTANT_CONDITIONS_NOT_PROBABILITY' as const,unresolved:Object.entries(p.requirementStatus).filter(([,v])=>v==='U').map(([k])=>k)};
}
