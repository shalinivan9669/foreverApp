/** Adapted from VMESTE_matching_pair_v0_3/src/pair.ts.
 * Runtime parser inputs deliberately use unknown: callers may pass untrusted JSON;
 * each parser validates shape and values before constructing a domain type.
 * No implicit any or assertion of unvalidated client data is introduced.
 */
/** Separate pair-context data. No reporter can overwrite another person's skill. */
import type {Truth} from './core';
import type {Actor} from './matching';
export interface Confirmation {readonly actor:Actor;readonly agreementRevision:number;readonly contentHash:string;readonly decision:Truth;}
export interface AgreementVersion {
 readonly id:string;readonly pairId:string;readonly revision:number;readonly contentHash:string;
 readonly kind:'ORDINARY_TASK'|'COMMUNICATION_COORDINATION'|'INTIMATE_ACT'|'PERSONAL_DISCLOSURE';
 readonly confirmations:readonly Confirmation[];readonly revoked:boolean;
}
export function agreementStatus(a:AgreementVersion,currentPairId:string):'ACTIVE'|'NEEDS_TWO_CONFIRMATIONS'|'REVOKED'|'WRONG_PAIR'|'NO_OBLIGATION_TO_CONSENT'{
 if(a.pairId!==currentPairId)return 'WRONG_PAIR';
 if(a.kind==='INTIMATE_ACT'||a.kind==='PERSONAL_DISCLOSURE')return 'NO_OBLIGATION_TO_CONSENT';
 if(a.revoked)return 'REVOKED';
 if(!Number.isSafeInteger(a.revision)||a.revision<1||!a.contentHash.length)throw new Error('INVALID_AGREEMENT');
 if(new Set(a.confirmations.map(c=>c.actor)).size!==a.confirmations.length)throw new Error('DUPLICATE_CONFIRMATION');
 return (['A','B'] as const).every(actor=>a.confirmations.some(c=>c.actor===actor&&c.decision==='T'&&c.agreementRevision===a.revision&&c.contentHash===a.contentHash))?'ACTIVE':'NEEDS_TWO_CONFIRMATIONS';
}
export interface PairReport {readonly actor:Actor;readonly pairId:string;readonly period:string;readonly metricId:string;readonly scaleVersion:string;readonly value:'NEEDS_CHANGE'|'ACCEPTABLE'|'GOOD'|null;readonly shared:boolean;}
export function comparePairReports(a:PairReport,b:PairReport,currentPairId:string){
 if(a.actor!=='A'||b.actor!=='B')throw new Error('ACTOR_ORDER');
 if(a.pairId!==currentPairId||b.pairId!==currentPairId||a.period!==b.period||a.metricId!==b.metricId||a.scaleVersion!==b.scaleVersion)return {status:'INCOMPARABLE' as const,a:null,b:null};
 // The shared result never branches on an undisclosed value. Independent personal views are separate endpoints.
 const va=a.shared?a.value:null,vb=b.shared?b.value:null;
 if(va===null||vb===null)return {status:'SHARED_DATA_INCOMPLETE' as const,a:va,b:vb};
 return {status:va==='NEEDS_CHANGE'||vb==='NEEDS_CHANGE'?'AT_LEAST_ONE_REQUESTS_CHANGE' as const:va===vb?'SAME_REPORTED_CATEGORY' as const:'DIFFERENT_REPORTED_CATEGORIES' as const,a:va,b:vb};
}
export function ordinalReportTrend(before:PairReport,after:PairReport):'IMPROVED_REPORTED_CATEGORY'|'LOWER_REPORTED_CATEGORY'|'SAME_REPORTED_CATEGORY'|'UNKNOWN'|'INCOMPARABLE'{
 if(before.actor!==after.actor||before.pairId!==after.pairId||before.metricId!==after.metricId||before.scaleVersion!==after.scaleVersion)return 'INCOMPARABLE';
 if(before.value===null||after.value===null)return 'UNKNOWN';
 const rank={NEEDS_CHANGE:0,ACCEPTABLE:1,GOOD:2};
 return rank[after.value]>rank[before.value]?'IMPROVED_REPORTED_CATEGORY':rank[after.value]<rank[before.value]?'LOWER_REPORTED_CATEGORY':'SAME_REPORTED_CATEGORY';
}
