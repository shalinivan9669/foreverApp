/** Adapted from VMESTE_skill_engine_v0_2/src/index.ts.
 * Runtime parser inputs deliberately use unknown: callers may pass untrusted JSON;
 * each parser validates shape and values before constructing a domain type.
 * No implicit any or assertion of unvalidated client data is introduced.
 */
/** Reference mathematics only. Caller authenticates subject, source, scope and consent.
 * Counts are descriptions of reported/assigned episodes, never latent-trait probabilities.
 */
export type Truth = 'T' | 'F' | 'U';
export type Track = 'KNOWLEDGE' | 'TASK' | 'SELF_REPORT' | 'PARTNER_REPORT';
export type Phase = 'BASELINE' | 'ASSISTED' | 'FOLLOWUP';
export type Facts = Readonly<Record<string, Truth>>;
export type Expr =
  | { readonly op: 'FACT'; readonly key: string }
  | { readonly op: 'NOT'; readonly arg: Expr }
  | { readonly op: 'ALL' | 'ANY'; readonly args: readonly Expr[] };
export function allFacts(keys: readonly string[]): Expr {
  if (!keys.length) throw new Error('EMPTY_RULE');
  return {op: 'ALL', args: keys.map(key => ({op:'FACT',key}))};
}
export function evaluate(expr: Expr, facts: Facts): Truth {
  let nodes = 0;
  function walk(e: Expr, depth: number): Truth {
    if (++nodes > 512 || depth > 24) throw new Error('RULE_BUDGET_EXCEEDED');
    if (e.op === 'FACT') return Object.hasOwn(facts,e.key) ? facts[e.key]! : 'U';
    if (e.op === 'NOT') { const v=walk(e.arg,depth+1); return v==='U'?'U':v==='T'?'F':'T'; }
    if (e.op !== 'ALL' && e.op !== 'ANY') throw new Error('UNKNOWN_OPERATOR');
    if (!e.args.length) throw new Error('EMPTY_RULE');
    const a=e.args.map(child=>walk(child,depth+1)); // validate all branches, not just witness
    return e.op==='ALL' ? a.includes('F')?'F':a.includes('U')?'U':'T'
      : a.includes('T')?'T':a.includes('U')?'U':'F';
  }
  return walk(expr,0);
}
function object(value: unknown): Record<string,unknown> {
  if (value===null || typeof value!=='object' || Array.isArray(value)) throw new Error('EXPECTED_OBJECT');
  return value as Record<string,unknown>;
}
function exactKeys(v: Record<string,unknown>, allowed: readonly string[]): void {
  if (Object.keys(v).some(k=>!allowed.includes(k))) throw new Error('UNEXPECTED_FIELD');
}
function id(v: unknown): string {
  if(typeof v!=='string'||!v.length||v.length>240) throw new Error('INVALID_ID'); return v;
}
export function parseFacts(input: unknown): Facts {
  const v=object(input), out:Record<string,Truth>=Object.create(null) as Record<string,Truth>;
  if (Object.keys(v).length>512) throw new Error('FACT_BUDGET_EXCEEDED');
  for(const [k,t] of Object.entries(v)) {
    id(k); if(t!=='T'&&t!=='F'&&t!=='U') throw new Error('INVALID_TRUTH'); out[k]=t;
  }
  return out;
}
export function parseExpr(input: unknown): Expr {
  let nodes=0;
  function parse(v0:unknown, depth:number):Expr {
    if(++nodes>512||depth>24) throw new Error('RULE_BUDGET_EXCEEDED');
    const v=object(v0);
    if(v.op==='FACT') {exactKeys(v,['op','key']); return {op:'FACT',key:id(v.key)};}
    if(v.op==='NOT') {exactKeys(v,['op','arg']);return {op:'NOT',arg:parse(v.arg,depth+1)};}
    if(v.op==='ALL'||v.op==='ANY') {
      exactKeys(v,['op','args']);if(!Array.isArray(v.args)||!v.args.length||v.args.length>128)throw new Error('INVALID_RULE_ARGS');
      return {op:v.op,args:v.args.map(x=>parse(x,depth+1))};
    }
    throw new Error('UNKNOWN_OPERATOR');
  }
  return parse(input,0);
}
export interface Scope {
  readonly subjectId:string; readonly contextKey:string; readonly windowId:string;
  readonly track:Track; readonly phase:Phase; readonly instrumentVersion:string;
}
export interface Observation extends Scope {
  readonly sourceId:string; readonly revision:number; readonly rootId:string;
  readonly familyId:string; readonly measureIds:readonly string[]; readonly facts:Facts;
}
export function parseObservation(input:unknown):Observation {
  const v=object(input);
  exactKeys(v,['subjectId','contextKey','windowId','track','phase','instrumentVersion','sourceId','revision','rootId','familyId','measureIds','facts']);
  if(v.track!=='KNOWLEDGE'&&v.track!=='TASK'&&v.track!=='SELF_REPORT'&&v.track!=='PARTNER_REPORT')throw new Error('INVALID_TRACK');
  if(v.phase!=='BASELINE'&&v.phase!=='ASSISTED'&&v.phase!=='FOLLOWUP')throw new Error('INVALID_PHASE');
  if(typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1)throw new Error('INVALID_REVISION');
  if(!Array.isArray(v.measureIds)||!v.measureIds.length||v.measureIds.length>128)throw new Error('INVALID_MEASURES');
  const measureIds=v.measureIds.map(id); if(new Set(measureIds).size!==measureIds.length)throw new Error('DUPLICATE_MEASURE');
  return {subjectId:id(v.subjectId),contextKey:id(v.contextKey),windowId:id(v.windowId),track:v.track,phase:v.phase,
    instrumentVersion:id(v.instrumentVersion),sourceId:id(v.sourceId),revision:v.revision,rootId:id(v.rootId),
    familyId:id(v.familyId),measureIds,facts:parseFacts(v.facts)};
}
const scopeKeys=['subjectId','contextKey','windowId','track','phase','instrumentVersion'] as const;
function sameScope(a:Scope,b:Scope):boolean{return scopeKeys.every(k=>a[k]===b[k]);}
function fingerprint(o:Observation):string {
  return JSON.stringify({...o,measureIds:[...o.measureIds].sort(),facts:Object.entries(o.facts).sort(([a],[b])=>a.localeCompare(b))});
}
export interface RootObservation {
  readonly rootId:string; readonly familyId:string; readonly measureIds:readonly string[];
  readonly facts:Facts; readonly disputedKeys:readonly string[]; readonly sources:readonly string[];
}
/** One current revision per source, then one episode root per scope. Duplicate questions are not new episodes. */
export function canonicalRoots(inputs:readonly unknown[],scope:Scope):readonly RootObservation[] {
  if(inputs.length>10000)throw new Error('OBSERVATION_BUDGET_EXCEEDED');
  const sources=new Map<string,Observation>();
  for(const raw of inputs){
    const o=parseObservation(raw),old=sources.get(o.sourceId);
    if(old){
      if(!sameScope(o,old)||o.rootId!==old.rootId||o.familyId!==old.familyId)throw new Error('SOURCE_IDENTITY_CHANGED');
      if(o.revision===old.revision&&fingerprint(o)!==fingerprint(old))throw new Error('REVISION_COLLISION');
      if(o.revision<old.revision)continue;
    }
    sources.set(o.sourceId,o);
  }
  const groups=new Map<string,Observation[]>();
  for(const o of sources.values())if(sameScope(o,scope))groups.set(o.rootId,[...(groups.get(o.rootId)??[]),o]);
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([rootId,rows])=>{
    const families=[...new Set(rows.map(o=>o.familyId))];
    if(families.length!==1)throw new Error('ROOT_FAMILY_COLLISION');
    const keys=[...new Set(rows.flatMap(o=>Object.keys(o.facts)))].sort();
    const facts:Record<string,Truth>=Object.create(null) as Record<string,Truth>, disputedKeys:string[]=[];
    for(const key of keys){
      const known=new Set(rows.map(o=>o.facts[key]).filter(v=>v==='T'||v==='F'));
      if(known.size===2){facts[key]='U';disputedKeys.push(key);}else facts[key]=known.has('T')?'T':known.has('F')?'F':'U';
    }
    return {rootId,familyId:families[0]!,measureIds:[...new Set(rows.flatMap(o=>o.measureIds))].sort(),facts,
      disputedKeys,sources:rows.map(o=>`${o.sourceId}@${o.revision}`).sort()};
  });
}
export interface RateSummary {
  readonly yes:number; readonly no:number; readonly unknown:number; readonly denominator:number;
  readonly excluded:number; readonly unknownEligibility:number; readonly occurrenceRoots:readonly string[];
  readonly assessedFamilies:readonly string[];
  readonly rate:number|null; readonly bounds:readonly[number,number]|null;
  readonly signedRate:number|null; readonly signedBounds:readonly[number,number]|null;
  readonly coverage:number|null;
  readonly interpretation:'FINITE_DESCRIBED_EPISODES_NOT_FUTURE_PROBABILITY';
}
/** Eligibility is a separate fact; it never follows from a desirable answer. */
export function summarize(roots:readonly RootObservation[],measureId:string,predicate:Expr):RateSummary {
  let yes=0,no=0,unknown=0,excluded=0,unknownEligibility=0;
  const occurrenceRoots:string[]=[],families=new Set<string>();
  for(const r of roots){
    if(!r.measureIds.includes(measureId))continue;
    const outcome=evaluate(predicate,r.facts), eligible=r.facts[`${measureId}:eligible`]??'U';
    if(outcome==='T')occurrenceRoots.push(r.rootId); // occurrence can be known without complete denominator
    if(eligible==='F'){if(outcome==='T')throw new Error('OUTCOME_ELIGIBILITY_CONTRADICTION');excluded++;continue;}
    if(eligible==='U'){unknownEligibility++;continue;}
    if(outcome==='T')yes++; else if(outcome==='F')no++; else unknown++;
    if(outcome!=='U')families.add(r.familyId);
  }
  const n=yes+no+unknown;
  const bounds:readonly[number,number]|null=n>0&&unknownEligibility===0?[yes/n,(yes+unknown)/n]:null;
  const rate=bounds&&unknown===0?yes/n:null;
  return {yes,no,unknown,denominator:n,excluded,unknownEligibility,occurrenceRoots,assessedFamilies:[...families].sort(),
    rate,bounds,signedRate:rate===null?null:rate===0?0:-rate,
    signedBounds:bounds?[bounds[1]===0?0:-bounds[1],bounds[0]===0?0:-bounds[0]]:null,
    coverage:n>0?(yes+no)/n:null,interpretation:'FINITE_DESCRIBED_EPISODES_NOT_FUTURE_PROBABILITY'};
}
export interface DecisionPolicy {
  readonly minAssessed:number; readonly minFamilies:number;
  readonly requiredRateNumerator:number; readonly requiredRateDenominator:number;
  readonly status:'AUTHOR_POLICY_NOT_CALIBRATED';
}
export type CriterionDecision='MET'|'NOT_MET'|'UNRESOLVED';
export function decide(s:RateSummary,p:DecisionPolicy):CriterionDecision {
  const {minAssessed:a,minFamilies:f,requiredRateNumerator:k,requiredRateDenominator:d}=p;
  if(![a,f,k,d].every(Number.isSafeInteger)||a<1||f<1||k<=0||d<=0||k>d)throw new Error('INVALID_POLICY');
  if(s.bounds===null||s.yes+s.no<a||s.assessedFamilies.length<f)return 'UNRESOLVED';
  // Integer cross-multiplication: equality at authored threshold is deterministic.
  if(s.yes*d>=k*s.denominator)return 'MET';
  if((s.yes+s.unknown)*d<k*s.denominator)return 'NOT_MET';
  return 'UNRESOLVED';
}
export interface SkillRubric {
  readonly skillId:string; readonly version:string;
  readonly cumulativeFacts:readonly[readonly string[],readonly string[],readonly string[]];
  readonly policy:DecisionPolicy;
  readonly status:'AUTHOR_RUBRIC_NOT_VALIDATED';
}
export function validateRubric(r:SkillRubric):void {
  if(r.cumulativeFacts.length!==3)throw new Error('THREE_LEVELS_REQUIRED');
  for(let i=0;i<3;i++){
    const current=r.cumulativeFacts[i]!;
    if(!current.length||new Set(current).size!==current.length)throw new Error('INVALID_CRITERIA');
    if(i>0&&r.cumulativeFacts[i-1]!.some(k=>!current.includes(k)))throw new Error('NON_NESTED_RUBRIC');
  }
}
export function resolveLevels(decisions:readonly CriterionDecision[]) {
  if(decisions.length!==3)throw new Error('THREE_LEVELS_REQUIRED');
  const possible=[0,1,2,3].filter(level=>decisions.every((v,i)=>v==='UNRESOLVED'||(v==='MET'?level>=i+1:level<i+1)));
  return {possibleLevels:possible,exactLevel:possible.length===1?possible[0]!:null,
    status:possible.length===0?'INCONSISTENT_EVIDENCE':possible.length===4?'UNKNOWN':possible.length===1?'RUBRIC_LEVEL':'PARTIAL_LEVEL',
    meaning:'Result under authored rubric; not a probability or a global fact about the person.'};
}
export function evaluateSkill(roots:readonly RootObservation[],r:SkillRubric){
  validateRubric(r);
  const criteria=r.cumulativeFacts.map((keys,i)=>{
    const evidence=summarize(roots,r.skillId,allFacts(keys));
    return {level:i+1,decision:decide(evidence,r.policy),evidence};
  });
  return {skillId:r.skillId,rubricVersion:r.version,criteria,...resolveLevels(criteria.map(x=>x.decision)),
    validationStatus:r.status,quantitativeConfidence:null};
}
export interface PatternDefinition {
  readonly id:string; readonly predicate:Expr; readonly impactKind:string;
  readonly protectiveRouteOnReportedMatch:boolean;
}
export function evaluatePattern(roots:readonly RootObservation[],p:PatternDefinition,scope:Scope){
  const evidence=summarize(roots,p.id,p.predicate);
  const occurrenceCount=evidence.occurrenceRoots.length;
  return {patternId:p.id,impactKind:p.impactKind,evidence,
    occurrenceState:occurrenceCount>=2?'REPEATED_IN_DESCRIBED_EPISODES':occurrenceCount===1?'REPORTED_OCCURRENCE':
      evidence.rate===0?'NOT_REPORTED_IN_ASSESSED_EPISODES':'UNKNOWN',
    protectiveRoute:p.protectiveRouteOnReportedMatch&&occurrenceCount>0&&scope.track!=='TASK'&&scope.track!=='KNOWLEDGE',
    sourceMeaning:scope.track==='KNOWLEDGE'?'UNDERSTANDING_IN_TASK':scope.track==='TASK'?'CHOICE_IN_TASK':scope.track==='SELF_REPORT'?'SELF_REPORTED_ACTION':'REPORT_ABOUT_INTERACTION',
    canOverwriteAnotherPerson:false,canCertifySafety:false,canOffsetByPositiveSkills:false};
}
export type AgreementKind='ORDINARY_TASK'|'COMMUNICATION_COORDINATION'|'INTIMATE_ACT'|'PERSONAL_DISCLOSURE';
export interface AgreementInput {
  readonly kind:AgreementKind; readonly validVoluntaryAgreement:Truth; readonly dueOpportunity:Truth;
  readonly completed:Truth; readonly timelyReleaseOrRenegotiation:Truth; readonly resourceConstraint:Truth;
  readonly safeFeasibleManagementAction:Truth; readonly managementActionOmitted:Truth;
}
export function classifyAgreement(a:AgreementInput):string {
  if(a.kind==='INTIMATE_ACT'||a.kind==='PERSONAL_DISCLOSURE')return 'OUT_OF_SCOPE_NO_OBLIGATION_TO_CONSENT';
  if(a.validVoluntaryAgreement==='F')return 'NO_VALID_AGREEMENT';
  if(a.validVoluntaryAgreement==='U')return 'UNKNOWN_AGREEMENT';
  if(a.timelyReleaseOrRenegotiation==='T')return 'RELEASED_OR_RENEGOTIATED';
  if(a.dueOpportunity==='F')return 'NOT_DUE_OR_NO_OPPORTUNITY';
  if(a.dueOpportunity==='U'||a.completed==='U')return 'UNKNOWN_OUTCOME';
  if(a.completed==='T')return 'FULFILLED';
  if(a.timelyReleaseOrRenegotiation==='U')return 'UNKNOWN_REVISION';
  if(a.safeFeasibleManagementAction==='T'&&a.managementActionOmitted==='T')return 'NONFULFILLED_WITH_MANAGEMENT_OMISSION';
  if(a.resourceConstraint==='T')return 'NONFULFILLED_WITH_CONSTRAINT';
  return 'NONFULFILLED_CAUSE_NOT_ESTABLISHED';
}
export type MissingReason='SKIPPED'|'NO_EXPERIENCE'|'NO_OPPORTUNITY'|'UNCLEAR'|'NONE_FITS'|'NOT_APPLICABLE';
export interface QuestionnaireItem {
  readonly id:string;readonly outputKeys:readonly string[];
  readonly options:readonly {readonly id:string;readonly facts:Facts}[];
}
export type Answer={readonly kind:'CHOICE';readonly optionId:string}|{readonly kind:'MISSING';readonly reason:MissingReason};
/** Strictly author-defined option mapping. No position/wording/free-text scoring. */
export function scoreAnswer(item:QuestionnaireItem,input:unknown):Facts {
  if(!item.outputKeys.length||new Set(item.outputKeys).size!==item.outputKeys.length)throw new Error('INVALID_OUTPUT_KEYS');
  if(new Set(item.options.map(o=>o.id)).size!==item.options.length)throw new Error('DUPLICATE_OPTION');
  for(const o of item.options){parseFacts(o.facts);if(Object.keys(o.facts).some(k=>!item.outputKeys.includes(k)))throw new Error('UNDECLARED_FACT');}
  const a=object(input);
  if(a.kind==='MISSING'){
    exactKeys(a,['kind','reason']);
    if(!['SKIPPED','NO_EXPERIENCE','NO_OPPORTUNITY','UNCLEAR','NONE_FITS','NOT_APPLICABLE'].includes(String(a.reason)))throw new Error('INVALID_MISSING_REASON');
    return Object.fromEntries(item.outputKeys.map(k=>[k,'U'])) as Record<string,Truth>;
  }
  exactKeys(a,['kind','optionId']);if(a.kind!=='CHOICE')throw new Error('INVALID_ANSWER_KIND');
  const option=item.options.find(o=>o.id===a.optionId);if(!option)throw new Error('UNKNOWN_OPTION');
  return Object.fromEntries(item.outputKeys.map(k=>[k,Object.hasOwn(option.facts,k)?option.facts[k]!:'U'])) as Record<string,Truth>;
}
/** Frontiers of unresolved criteria, not an information-theory claim without calibration. */
export function nextCriterion(decisions:readonly CriterionDecision[]):number|null {
  const index=decisions.findIndex(v=>v==='UNRESOLVED');return index===-1?null:index+1;
}
export interface BoundItem extends QuestionnaireItem {readonly rootSlotId:string;}
export interface QuestionnairePublication {
  readonly id:string;readonly version:string;readonly items:readonly BoundItem[];
}
export interface TrustedSlot {
  readonly rootId:string;readonly familyId:string;readonly measureIds:readonly string[];
  readonly applicabilityFacts:Facts;
}
export interface TrustedSubmission extends Scope {
  readonly sourcePrefix:string;readonly revision:number;readonly presentedItemIds:readonly string[];
  readonly slots:Readonly<Record<string,TrustedSlot>>;
}
/** The request contains answers only. TrustedSubmission is assembled by a future application adapter. */
export function scoreSubmission(publication:QuestionnairePublication,input:unknown,trusted:TrustedSubmission){
  const req=object(input);exactKeys(req,['publicationId','publicationVersion','answers']);
  if(req.publicationId!==publication.id||req.publicationVersion!==publication.version)throw new Error('PUBLICATION_MISMATCH');
  if(!Array.isArray(req.answers)||req.answers.length>1000)throw new Error('INVALID_ANSWERS');
  const items=new Map(publication.items.map(x=>[x.id,x]));
  if(items.size!==publication.items.length)throw new Error('DUPLICATE_ITEM');
  const presented=new Set(trusted.presentedItemIds);
  if(presented.size!==trusted.presentedItemIds.length||[...presented].some(x=>!items.has(x)))throw new Error('INVALID_PRESENTATION_SET');
  const answers=new Map<string,unknown>();
  for(const raw of req.answers){
    const r=object(raw);exactKeys(r,['itemId','response']);const key=id(r.itemId);
    if(!items.has(key))throw new Error('UNKNOWN_ITEM');
    if(!presented.has(key))throw new Error('ITEM_NOT_PRESENTED');
    if(answers.has(key))throw new Error('DUPLICATE_RESPONSE');answers.set(key,r.response);
  }
  const participation:{itemId:string;status:'ANSWERED'|'MISSING'|'NOT_ANSWERED';reason:string|null}[]=[];
  const observations:Observation[]=[];
  for(const key of trusted.presentedItemIds){
    const item=items.get(key)!,slot=trusted.slots[item.rootSlotId];if(!slot)throw new Error('MISSING_TRUSTED_ROOT');
    if(item.outputKeys.some(k=>Object.hasOwn(slot.applicabilityFacts,k)))throw new Error('ITEM_OVERWRITES_TRUSTED_APPLICABILITY');
    const received=answers.has(key),raw=answers.get(key);
    const facts=received?scoreAnswer(item,raw):Object.fromEntries(item.outputKeys.map(k=>[k,'U'])) as Record<string,Truth>;
    const answer=received?object(raw):null;
    participation.push({itemId:key,status:answer===null?'NOT_ANSWERED':answer.kind==='MISSING'?'MISSING':'ANSWERED',reason:answer?.kind==='MISSING'?String(answer.reason):null});
    observations.push(parseObservation({...Object.fromEntries(scopeKeys.map(k=>[k,trusted[k]])),
      sourceId:`${trusted.sourcePrefix}:${key}`,revision:trusted.revision,rootId:slot.rootId,familyId:slot.familyId,
      measureIds:slot.measureIds,facts:{...slot.applicabilityFacts,...facts}}));
  }
  return {publicationId:publication.id,publicationVersion:publication.version,participation,observations};
}
