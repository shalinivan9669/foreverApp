/** Adapted from VMESTE_matching_pair_v0_3/src/matching.ts.
 * Runtime parser inputs deliberately use unknown: callers may pass untrusted JSON;
 * each parser validates shape and values before constructing a domain type.
 * No implicit any or assertion of unvalidated client data is introduced.
 */
/** Bounded constraint simulation, NOT a relationship-outcome predictor.
 * The application must assemble a CURRENT, authorised snapshot before calling this module.
 * Gate, provenance, permissions and action willingness are server-owned, never client claims.
 * Findings concern the finite published configurations/actions, not all possible human lives.
 */
import {evaluate, parseExpr, parseFacts, type Expr, type Facts, type Truth} from './core';
export type Actor='A'|'B';
export type Direction='A_FROM_B'|'B_FROM_A'|'BOTH';
export type FactKind='SKILL'|'OFFER'|'COORDINATION'|'RESOURCE_CONDITION'|'FIXED_POSITION'|'BOUNDARY'|'HISTORY'|'SAFETY'|'PLAN';
export interface FactDefinition {readonly id:string;readonly kind:FactKind;readonly owner:Actor|'JOINT';readonly domain:string;}
export interface Requirement {readonly id:string;readonly domain:string;readonly direction:Direction;readonly tier:'MUST'|'IMPORTANT'|'PREFERENCE';readonly predicate:Expr;}
export interface Resource {readonly id:string;readonly owner:Actor|'JOINT';readonly unit:string;readonly period:string;readonly capacity:number|null;}
export interface Configuration {readonly id:string;readonly choices:Facts;readonly precondition:Expr;readonly use:Readonly<Record<string,number>>;}
export interface Change {
 readonly id:string;readonly label:string;readonly owners:readonly Actor[];
 readonly effects:Facts;readonly precondition:Expr;readonly costs:Readonly<Record<string,number>>;
 readonly willingness:Readonly<Record<Actor,Truth>>;readonly prerequisites:readonly string[];
 readonly verification:string;readonly interpretation:'ASSUMED_OUTCOME_NOT_FORECAST';
}
export interface Snapshot {
 readonly id:string;readonly revision:number;readonly permissionRevision:number;readonly context:string;
 readonly mode:'MATCHING'|'PAIR';readonly gate:'AVAILABLE'|'UNAVAILABLE';readonly values:Facts;
}
export interface Problem {
 readonly publicationId:string;readonly snapshot:Snapshot;readonly factDefinitions:readonly FactDefinition[];
 readonly requirements:readonly Requirement[];readonly resources:readonly Resource[];
 readonly configurations:readonly Configuration[];readonly worldConstraints:readonly Expr[];
 readonly changes:readonly Change[];
 readonly target:{readonly importantNumerator:number;readonly importantDenominator:number;readonly status:'AUTHOR_POLICY_NOT_VALIDATED'};
}
export interface Limits {readonly maxWorlds:number;readonly maxChecks:number;readonly maxActionSets:number;readonly maxActionsPerSet:number;}
const DEFAULT_LIMITS:Limits={maxWorlds:1024,maxChecks:200000,maxActionSets:512,maxActionsPerSet:3};
const kinds:readonly FactKind[]=['SKILL','OFFER','COORDINATION','RESOURCE_CONDITION','FIXED_POSITION','BOUNDARY','HISTORY','SAFETY','PLAN'];
const mutable:readonly FactKind[]=['SKILL','OFFER','COORDINATION','RESOURCE_CONDITION'];
function fail(message:string):never{throw new Error(message);}
function obj(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))return fail('EXPECTED_OBJECT');return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:readonly string[]):void{if(Object.keys(v).some(k=>!allowed.includes(k)))fail('UNEXPECTED_FIELD');}
function id(v:unknown):string{if(typeof v!=='string'||v.length===0||v.length>240)return fail('INVALID_ID');return v;}
function integer(v:unknown,min=0):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>1000000000)return fail('INVALID_INTEGER');return v;}
function list(v:unknown,min=0,max=128):readonly unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)return fail('INVALID_LIST');return v;}
function select<T extends string>(v:unknown,options:readonly T[]):T{if(!options.includes(v as T))return fail('INVALID_ENUM');return v as T;}
function unique(values:readonly string[],code:string):void{if(new Set(values).size!==values.length)fail(code);}
function amounts(v:unknown):Readonly<Record<string,number>>{return Object.fromEntries(Object.entries(obj(v)).map(([k,x])=>[id(k),integer(x)]));}
function refs(e:Expr):readonly string[]{return e.op==='FACT'?[e.key]:e.op==='NOT'?refs(e.arg):e.args.flatMap(refs);}
function fraction(p:number,q:number):void{if(!Number.isSafeInteger(p)||!Number.isSafeInteger(q)||p<1||q<1||p>q||q>1000)fail('INVALID_FRACTION');}
/** This parses shape and authoring references, NOT authenticity or scientific validity. */
export function parseProblem(input:unknown):Problem {
 const p=obj(input);keys(p,['publicationId','snapshot','factDefinitions','requirements','resources','configurations','worldConstraints','changes','target']);
 const factDefinitions=list(p.factDefinitions,1).map(v=>{const f=obj(v);keys(f,['id','kind','owner','domain']);return {id:id(f.id),kind:select(f.kind,kinds),owner:select(f.owner,['A','B','JOINT'] as const),domain:id(f.domain)};});
 unique(factDefinitions.map(x=>x.id),'DUPLICATE_FACT');const definitions=new Map(factDefinitions.map(f=>[f.id,f]));
 const s=obj(p.snapshot);keys(s,['id','revision','permissionRevision','context','mode','gate','values']);
 const snapshot:Snapshot={id:id(s.id),revision:integer(s.revision,1),permissionRevision:integer(s.permissionRevision,1),context:id(s.context),mode:select(s.mode,['MATCHING','PAIR']),gate:select(s.gate,['AVAILABLE','UNAVAILABLE']),values:parseFacts(s.values)};
 for(const k of Object.keys(snapshot.values))if(!definitions.has(k)||definitions.get(k)!.kind==='PLAN')fail('INVALID_SNAPSHOT_FACT');
 const resources=list(p.resources,0,32).map(v=>{const r=obj(v);keys(r,['id','owner','unit','period','capacity']);return {id:id(r.id),owner:select(r.owner,['A','B','JOINT'] as const),unit:id(r.unit),period:id(r.period),capacity:r.capacity===null?null:integer(r.capacity)};});
 unique(resources.map(x=>x.id),'DUPLICATE_RESOURCE');const resourceMap=new Map(resources.map(r=>[r.id,r]));
 const checkAmounts=(a:Readonly<Record<string,number>>)=>{for(const k of Object.keys(a))if(!resourceMap.has(k))fail('UNKNOWN_RESOURCE');};
 const checkExpr=(e:Expr,allowPlan:boolean)=>{for(const k of refs(e))if(!definitions.has(k)||(!allowPlan&&definitions.get(k)!.kind==='PLAN'))fail('INVALID_RULE_REFERENCE');};
 const requirements=list(p.requirements,1,128).map(v=>{const r=obj(v);keys(r,['id','domain','direction','tier','predicate']);const predicate=parseExpr(r.predicate);checkExpr(predicate,true);return {id:id(r.id),domain:id(r.domain),direction:select(r.direction,['A_FROM_B','B_FROM_A','BOTH'] as const),tier:select(r.tier,['MUST','IMPORTANT','PREFERENCE'] as const),predicate};});
 unique(requirements.map(r=>r.id),'DUPLICATE_REQUIREMENT');
 // An empty target for one participant cannot yield a vacuous declaration of mutual fit.
 for(const actor of ['A','B'] as const)if(!requirements.some(r=>needActor(r,actor)&&r.tier!=='PREFERENCE'))fail('EMPTY_TARGET_FOR_PARTICIPANT');
 const planKeys=factDefinitions.filter(f=>f.kind==='PLAN').map(f=>f.id).sort();
 const configurations=list(p.configurations,1,64).map(v=>{const c=obj(v);keys(c,['id','choices','precondition','use']);const choices=parseFacts(c.choices);if(JSON.stringify(Object.keys(choices).sort())!==JSON.stringify(planKeys)||Object.values(choices).includes('U'))fail('INCOMPLETE_PLAN_CHOICES');const precondition=parseExpr(c.precondition);checkExpr(precondition,false);const use=amounts(c.use);checkAmounts(use);return {id:id(c.id),choices,precondition,use};});
 unique(configurations.map(c=>c.id),'DUPLICATE_CONFIGURATION');
 const worldConstraints=list(p.worldConstraints,0,64).map(v=>{const e=parseExpr(v);checkExpr(e,false);return e;});
 const changes=list(p.changes,0,14).map(v=>{const a=obj(v);keys(a,['id','label','owners','effects','precondition','costs','willingness','prerequisites','verification','interpretation']);const owners=list(a.owners,1,2).map(o=>select(o,['A','B'] as const));unique(owners,'DUPLICATE_OWNER');const effects=parseFacts(a.effects);if(!Object.keys(effects).length)fail('EMPTY_EFFECTS');for(const [k,value] of Object.entries(effects)){const d=definitions.get(k);if(!d||!mutable.includes(d.kind))fail('PROTECTED_FACT_CHANGE');if(value==='U')fail('CANNOT_ERASE_EVIDENCE_AS_ACTION');if(d.kind==='SKILL'&&value!=='T')fail('SKILL_ACTION_MUST_BE_ACHIEVED_CRITERION');if(d.owner==='JOINT'?owners.length!==2:!owners.includes(d.owner))fail('UNAUTHORISED_ACTION_OWNER');}
 const precondition=parseExpr(a.precondition);checkExpr(precondition,false);const costs=amounts(a.costs);checkAmounts(costs);for(const [k,amount]of Object.entries(costs)){const owner=resourceMap.get(k)!.owner;if(amount>0&&(owner==='JOINT'?owners.length!==2:!owners.includes(owner)))fail('UNCONSENTED_BURDEN_TRANSFER');}
 const w=obj(a.willingness);keys(w,['A','B']);const willingness={A:select(w.A,['T','F','U'] as const),B:select(w.B,['T','F','U'] as const)};
 const prerequisites=list(a.prerequisites,0,14).map(id);unique(prerequisites,'DUPLICATE_PREREQUISITE');
 return {id:id(a.id),label:id(a.label),owners,effects,precondition,costs,willingness,prerequisites,verification:id(a.verification),interpretation:select(a.interpretation,['ASSUMED_OUTCOME_NOT_FORECAST'] as const)};
 });unique(changes.map(a=>a.id),'DUPLICATE_CHANGE');const changeMap=new Map(changes.map(a=>[a.id,a]));
 const visiting=new Set<string>(),done=new Set<string>();
 function visit(key:string):void{if(visiting.has(key))fail('CYCLIC_CHANGES');if(done.has(key))return;const a=changeMap.get(key);if(!a)fail('UNKNOWN_CHANGE_PREREQUISITE');visiting.add(key);for(const q of a.prerequisites)visit(q);visiting.delete(key);done.add(key);}
 changes.forEach(a=>visit(a.id));
 const target=obj(p.target);keys(target,['importantNumerator','importantDenominator','status']);const n=integer(target.importantNumerator,1),d=integer(target.importantDenominator,1);fraction(n,d);
 return {publicationId:id(p.publicationId),snapshot,factDefinitions,requirements,resources,configurations,worldConstraints,changes,target:{importantNumerator:n,importantDenominator:d,status:select(target.status,['AUTHOR_POLICY_NOT_VALIDATED'])}};
}
class Budget {checks=0;constructor(readonly limits:Limits){} tick():void{if(++this.checks>this.limits.maxChecks)fail('BUDGET_EXCEEDED');}}
function limitsFrom(input:Partial<Limits>):Limits{const out={...DEFAULT_LIMITS,...input};for(const v of Object.values(out))integer(v,1);if(out.maxActionsPerSet>14||out.maxWorlds>65536||out.maxChecks>2000000||out.maxActionSets>16384)fail('INVALID_LIMIT');return out;}
function worlds(p:Problem,b:Budget):readonly Facts[]{const vars=p.factDefinitions.filter(f=>f.kind!=='PLAN');const unknown=vars.filter(f=>(p.snapshot.values[f.id]??'U')==='U');if(2**unknown.length>b.limits.maxWorlds)fail('BUDGET_EXCEEDED');const results:Facts[]=[];
 for(let mask=0;mask<2**unknown.length;mask++){b.tick();const w:Record<string,Truth>=Object.fromEntries(vars.map(f=>[f.id,p.snapshot.values[f.id]??'U']));unknown.forEach((f,i)=>{w[f.id]=(mask&(2**i))!==0?'T':'F';});if(p.worldConstraints.every(e=>evaluate(e,w)==='T'))results.push(w);}
 if(!results.length)fail('INCONSISTENT_INPUT_MODEL');return results;
}
export interface DirectionCounts {readonly matchedLower:number;readonly matchedUpper:number;readonly total:number;}
export interface PlanEvaluation {
 readonly configurationId:string;readonly resourceStatus:Truth;
 readonly requirementStatus:Readonly<Record<string,Truth>>;
 readonly robustFeasible:boolean;readonly possibleFeasible:boolean;readonly robustTarget:boolean;readonly possibleTarget:boolean;
 readonly a:DirectionCounts;readonly b:DirectionCounts;
}
export interface Evaluation {
 readonly status:'TARGET_SUPPORTED'|'FEASIBLE_WITH_DIFFERENCES'|'NEEDS_CLARIFICATION'|'NO_TARGET_PLAN_IN_CATALOG';
 readonly plans:readonly PlanEvaluation[];readonly robustTargetPlanIds:readonly string[];
 readonly targetPossibleInEveryWorld:boolean;readonly samePlanWorksAcrossWorlds:boolean;
 readonly independentFailingRequirements:readonly string[];
 readonly worldCount:number;readonly assumptionIds:readonly string[];
 readonly interpretation:'CONSTRAINT_SUPPORT_NOT_RELATIONSHIP_PROBABILITY';
}
function tFrom(values:readonly boolean[]):Truth{return values.every(Boolean)?'T':values.every(x=>!x)?'F':'U';}
function counts(values:readonly number[],total:number):DirectionCounts{return {matchedLower:Math.min(...values),matchedUpper:Math.max(...values),total};}
function needActor(r:Requirement,actor:Actor):boolean{return r.direction==='BOTH'||r.direction===(actor==='A'?'A_FROM_B':'B_FROM_A');}
function resourceStatus(p:Problem,c:Configuration,actions:readonly Change[]):Truth {let unknown=false;for(const r of p.resources){const cost=(c.use[r.id]??0)+actions.reduce((s,a)=>s+(a.costs[r.id]??0),0);if(cost===0)continue;if(r.capacity===null){unknown=true;continue;}if(cost>r.capacity)return 'F';}return unknown?'U':'T';}
function selectChanges(p:Problem,ids:readonly string[]):readonly Change[]{unique(ids,'DUPLICATE_SELECTED_CHANGE');const set=new Set(ids),byId=new Map(p.changes.map(a=>[a.id,a]));const effects=new Map<string,Truth>(),done=new Set<string>(),out:Change[]=[];
 function visit(key:string):void {if(done.has(key))return;const a=byId.get(key);if(!a)fail('UNKNOWN_CHANGE');if(a.owners.some(owner=>a.willingness[owner]==='F'))fail('CHANGE_EXPLICITLY_DECLINED');for(const before of a.prerequisites){if(!set.has(before))fail('MISSING_PREREQUISITE');visit(before);}for(const [k,v]of Object.entries(a.effects)){if(effects.has(k)&&effects.get(k)!==v)fail('CONFLICTING_EFFECTS');effects.set(k,v);}done.add(key);out.push(a);}
 [...ids].sort().forEach(visit);return out;
}
/** Effects are achieved-state assumptions, never edits to the original snapshot. */
function transform(p:Problem,w:Facts,actions:readonly Change[]):{facts:Facts;permitted:boolean}{let value:Facts={...w};for(const a of actions){if(evaluate(a.precondition,value)!=='T')return {facts:value,permitted:false};value={...value,...a.effects};if(!p.worldConstraints.every(e=>evaluate(e,value)==='T'))return {facts:value,permitted:false};}return {facts:value,permitted:true};}
function core(p:Problem,base:readonly Facts[],actions:readonly Change[],b:Budget):Evaluation {
 const rows=p.requirements;const targetFor=(actor:Actor)=>rows.filter(r=>needActor(r,actor)&&r.tier==='IMPORTANT');
 const ia=targetFor('A'),ib=targetFor('B');const matchesTarget=(n:number,total:number)=>total===0||n*p.target.importantDenominator>=total*p.target.importantNumerator;
 const transformed=base.map(w=>transform(p,w,actions));
 const possibleByWorld=base.map(()=>false);const plans:PlanEvaluation[]=[];
 for(const c of p.configurations){const rs=resourceStatus(p,c,actions);const values:Record<string,boolean[]>=Object.fromEntries(rows.map(r=>[r.id,[]]));const feasible:boolean[]=[],target:boolean[]=[],aCounts:number[]=[],bCounts:number[]=[];
 for(let i=0;i<transformed.length;i++){const t=transformed[i]!;const merged={...t.facts,...c.choices};const pre=t.permitted&&evaluate(c.precondition,t.facts)==='T';const scores=new Map<string,boolean>();for(const r of rows){b.tick();const v=evaluate(r.predicate,merged)==='T';scores.set(r.id,v);values[r.id]!.push(v);}
 const isFeasible=pre&&rows.filter(r=>r.tier==='MUST').every(r=>scores.get(r.id));const a=ia.filter(r=>scores.get(r.id)).length,bn=ib.filter(r=>scores.get(r.id)).length;const isTarget=isFeasible&&matchesTarget(a,ia.length)&&matchesTarget(bn,ib.length);
 feasible.push(isFeasible);target.push(isTarget);aCounts.push(a);bCounts.push(bn);if(isTarget&&rs!=='F')possibleByWorld[i]=true;
 }
 plans.push({configurationId:c.id,resourceStatus:rs,requirementStatus:Object.fromEntries(rows.map(r=>[r.id,tFrom(values[r.id]!)])),robustFeasible:rs==='T'&&feasible.every(Boolean),possibleFeasible:rs!=='F'&&feasible.some(Boolean),robustTarget:rs==='T'&&target.every(Boolean),possibleTarget:rs!=='F'&&target.some(Boolean),a:counts(aCounts,ia.length),b:counts(bCounts,ib.length)});
 }
 const robust=plans.filter(z=>z.robustTarget).map(z=>z.configurationId);const status=robust.length?'TARGET_SUPPORTED':plans.some(z=>z.possibleTarget)?'NEEDS_CLARIFICATION':plans.some(z=>z.robustFeasible)?'FEASIBLE_WITH_DIFFERENCES':'NO_TARGET_PLAN_IN_CATALOG';
 // This is NOT a minimal conflict core: it only lists individually false conditions in every published plan/world.
 const individual=rows.filter(r=>r.tier!=='PREFERENCE'&&plans.every(z=>z.requirementStatus[r.id]==='F')).map(r=>r.id);
 return {status,plans,robustTargetPlanIds:robust,targetPossibleInEveryWorld:possibleByWorld.every(Boolean),samePlanWorksAcrossWorlds:robust.length>0,independentFailingRequirements:individual,worldCount:base.length,assumptionIds:actions.map(a=>a.id),interpretation:'CONSTRAINT_SUPPORT_NOT_RELATIONSHIP_PROBABILITY'};
}
export type EvaluationResult={readonly kind:'RESULT';readonly value:Evaluation;readonly checks:number}|{readonly kind:'UNAVAILABLE'}|{readonly kind:'BUDGET_EXCEEDED';readonly checks:number};
export function evaluateModel(input:unknown,assumptionIds:readonly string[]=[],limitInput:Partial<Limits>={}):EvaluationResult {
 const p=parseProblem(input);if(p.snapshot.gate==='UNAVAILABLE')return {kind:'UNAVAILABLE'};const b=new Budget(limitsFrom(limitInput));try{return {kind:'RESULT',value:core(p,worlds(p,b),selectChanges(p,assumptionIds),b),checks:b.checks};}catch(e){if(e instanceof Error&&e.message==='BUDGET_EXCEEDED')return {kind:'BUDGET_EXCEEDED',checks:b.checks};throw e;}
}
export interface ConditionalPlan {
 readonly actionIds:readonly string[];readonly changedDomains:readonly string[];readonly affectedDomains:readonly string[];
 readonly phase:'MODEL_OPTION_NOT_CHOSEN'|'DECLARED_OPEN_NOT_AGREED';
 readonly costs:Readonly<Record<string,number>>;readonly targetPlanIds:readonly string[];
 readonly certificate:{readonly snapshotId:string;readonly sourceRevision:number;readonly permissionRevision:number;readonly publicationId:string;readonly context:string;readonly worldCount:number;readonly unknownInputIds:readonly string[];readonly verification:readonly string[];readonly isCausalForecast:false;readonly changesCurrentScore:false;};
 readonly after:Evaluation;
}
export interface SearchResult {
 readonly kind:'SEARCH';readonly current:Evaluation|null;readonly plans:readonly ConditionalPlan[];
 readonly completeness:'COMPLETE_WITHIN_LIMITS'|'BUDGET_EXCEEDED';readonly checkedActionSets:number;readonly checks:number;
 readonly singleDomainRouteIds:readonly string[];readonly rejected:readonly {readonly actionIds:readonly string[];readonly reason:string}[];
}
function subsets(ids:readonly string[],k:number):readonly string[][]{const out:string[][]=[];function walk(pos:number,acc:string[]):void{if(acc.length===k){out.push([...acc]);return;}for(let i=pos;i<ids.length;i++){acc.push(ids[i]!);walk(i+1,acc);acc.pop();}}walk(0,[]);return out;}
function subset(a:readonly string[],b:readonly string[]):boolean{return a.every(k=>b.includes(k));}
/** Inclusion-minimal sufficient sets, not "the one psychological cause" or a global cheapest treatment. */
export function findConditionalPlans(input:unknown,limitInput:Partial<Limits>={}):SearchResult|{readonly kind:'UNAVAILABLE'}{
 const p=parseProblem(input);if(p.snapshot.gate==='UNAVAILABLE')return {kind:'UNAVAILABLE'};const b=new Budget(limitsFrom(limitInput));let current:Evaluation|null=null,checkedActionSets=0;const found:ConditionalPlan[]=[],rejected:{actionIds:readonly string[];reason:string}[]=[];let complete:SearchResult['completeness']='COMPLETE_WITHIN_LIMITS';
 try{const base=worlds(p,b);current=core(p,base,[],b);if(current.samePlanWorksAcrossWorlds)return {kind:'SEARCH',current,plans:[],completeness:complete,checkedActionSets,checks:b.checks,singleDomainRouteIds:[],rejected};
 const changeIds=p.changes.map(a=>a.id).sort();
 outer:for(let k=1;k<=Math.min(changeIds.length,b.limits.maxActionsPerSet);k++)for(const ids of subsets(changeIds,k)){
 if(found.some(f=>subset(f.actionIds,ids)))continue;if(++checkedActionSets>b.limits.maxActionSets){complete='BUDGET_EXCEEDED';break outer;}
 let actions:readonly Change[];try{actions=selectChanges(p,ids);}catch(e){if(e instanceof Error&&['CHANGE_EXPLICITLY_DECLINED','MISSING_PREREQUISITE','CONFLICTING_EFFECTS'].includes(e.message)){rejected.push({actionIds:ids,reason:e.message});continue;}throw e;}
 const after=core(p,base,actions,b);if(!after.samePlanWorksAcrossWorlds)continue;
 // Protect every non-optional condition established in all current configurations.
 // Additional user-selected trade-off policies need a separate version, not a hidden weighted sum.
 const protectedIds=p.requirements.filter(r=>r.tier!=='PREFERENCE'&&current!.plans.every(z=>z.requirementStatus[r.id]==='T')).map(r=>r.id);
 const nonRegressing=after.plans.filter(z=>z.robustTarget&&protectedIds.every(key=>z.requirementStatus[key]==='T')).map(z=>z.configurationId);
 if(!nonRegressing.length){rejected.push({actionIds:ids,reason:'REGRESSES_ESTABLISHED_CONDITION'});continue;}
 const changedKeys=new Set(actions.flatMap(a=>Object.keys(a.effects)));
 // An outcome already achieved in all admissible current worlds is not a genuine change.
 if(actions.some(a=>Object.entries(a.effects).every(([key,value])=>base.every(w=>w[key]===value)))){rejected.push({actionIds:ids,reason:'REDUNDANT_ACHIEVED_STATE'});continue;}
 const changedDomains=[...new Set(p.factDefinitions.filter(d=>changedKeys.has(d.id)).map(d=>d.domain))].sort();
 const affectedDomains=[...new Set([...changedDomains,...p.requirements.filter(r=>refs(r.predicate).some(x=>changedKeys.has(x))).map(r=>r.domain)])].sort();
 const costs=Object.fromEntries(p.resources.map(r=>[r.id,actions.reduce((s,a)=>s+(a.costs[r.id]??0),0)]));
 found.push({actionIds:ids,changedDomains,affectedDomains,phase:actions.every(a=>a.owners.every(o=>a.willingness[o]==='T'))?'DECLARED_OPEN_NOT_AGREED':'MODEL_OPTION_NOT_CHOSEN',costs,targetPlanIds:nonRegressing,
 certificate:{snapshotId:p.snapshot.id,sourceRevision:p.snapshot.revision,permissionRevision:p.snapshot.permissionRevision,publicationId:p.publicationId,context:p.snapshot.context,worldCount:base.length,unknownInputIds:p.factDefinitions.filter(d=>d.kind!=='PLAN'&&(p.snapshot.values[d.id]??'U')==='U').map(d=>d.id),verification:actions.map(a=>a.verification),isCausalForecast:false,changesCurrentScore:false},after});
 }}catch(e){if(e instanceof Error&&e.message==='BUDGET_EXCEEDED')complete='BUDGET_EXCEEDED';else throw e;}
 // No claim that the domain is the only real problem. Only that this set is sufficient in the stated model.
 return {kind:'SEARCH',current,plans:found,completeness:complete,checkedActionSets,checks:b.checks,singleDomainRouteIds:found.filter(f=>f.changedDomains.length===1).map(f=>f.actionIds.join('+')),rejected};
}
/** Partial order only. No exchange rate between one participant's burden and the other's. */
export function paretoPlans(plans:readonly ConditionalPlan[],resourceIds:readonly string[]):readonly ConditionalPlan[]{return plans.filter(p=>!plans.some(q=>q!==p&&resourceIds.every(k=>(q.costs[k]??0)<=(p.costs[k]??0))&&resourceIds.some(k=>(q.costs[k]??0)<(p.costs[k]??0))));}
export function isCertificateCurrent(plan:ConditionalPlan,s:Snapshot,publicationId:string):boolean{return s.gate==='AVAILABLE'&&plan.certificate.snapshotId===s.id&&plan.certificate.sourceRevision===s.revision&&plan.certificate.permissionRevision===s.permissionRevision&&plan.certificate.context===s.context&&plan.certificate.publicationId===publicationId;}
/** Ordinal skill levels can support a threshold predicate, never linear distance or a level/3 conversion. */
export function skillAtLeast(possibleLevels:readonly number[],threshold:number):Truth{if(!possibleLevels.length||possibleLevels.some(l=>!Number.isInteger(l)||l<0||l>3)||!Number.isInteger(threshold)||threshold<0||threshold>3)fail('INVALID_ORDINAL_LEVELS');return tFrom(possibleLevels.map(l=>l>=threshold));}
export function intersectSets(a:readonly string[]|null,b:readonly string[]|null):{status:Truth;common:readonly string[]|null}{if(a===null||b===null)return {status:'U',common:null};const common=[...new Set(a)].filter(x=>b.includes(x)).sort();return {status:common.length?'T':'F',common};}
export interface Interval {readonly lower:number;readonly upper:number;readonly lowerClosed:boolean;readonly upperClosed:boolean;readonly unit:string;readonly period:string;}
export function intersectIntervals(a:Interval|null,b:Interval|null):{status:Truth;interval:Interval|null;reason:string|null}{if(a===null||b===null)return {status:'U',interval:null,reason:'MISSING'};for(const x of [a,b])if(!Number.isFinite(x.lower)||!Number.isFinite(x.upper)||x.lower>x.upper||typeof x.lowerClosed!=='boolean'||typeof x.upperClosed!=='boolean')fail('INVALID_INTERVAL');if(a.unit!==b.unit||a.period!==b.period)return {status:'U',interval:null,reason:'INCOMPARABLE'};
 const empty=(x:Interval)=>x.lower===x.upper&&(!x.lowerClosed||!x.upperClosed);if(empty(a)||empty(b))return {status:'F',interval:null,reason:null};const lower=Math.max(a.lower,b.lower),upper=Math.min(a.upper,b.upper);const lowerClosed=(a.lower!==lower||a.lowerClosed)&&(b.lower!==lower||b.lowerClosed),upperClosed=(a.upper!==upper||a.upperClosed)&&(b.upper!==upper||b.upperClosed);if(lower>upper||(lower===upper&&(!lowerClosed||!upperClosed)))return {status:'F',interval:null,reason:null};return {status:'T',interval:{lower,upper,lowerClosed,upperClosed,unit:a.unit,period:a.period},reason:null};}
