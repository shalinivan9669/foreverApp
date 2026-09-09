// Reference tests retained in full; imports target the application engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate,parseExpr,parseFacts,parseObservation,canonicalRoots,summarize,decide,resolveLevels,evaluateSkill,evaluatePattern,classifyAgreement,scoreAnswer,nextCriterion,validateRubric,allFacts} from '../../src/domain/assessment/engine/core.ts';
import {REQUEST_RUBRIC,DEMO_POLICY,RUBRICS} from '../../src/domain/assessment/engine/rubrics.ts';
const scope={subjectId:'u1',contextKey:'ordinary-contact',windowId:'window-1',track:'SELF_REPORT',phase:'BASELINE',instrumentVersion:'draft-0.2'};
const fact={op:'FACT',key:'result'};
function obs(i,result='T',extra={}){return {...scope,sourceId:`s${i}`,revision:1,rootId:`e${i}`,familyId:`f${i%2}`,measureIds:['M'],facts:{'M:eligible':'T',result},...extra};}
function roots(results){return canonicalRoots(results.map((v,i)=>obs(i,v)),scope);}
function summary(results){return summarize(roots(results),'M',fact);}
for(const a of ['T','F','U'])for(const b of ['T','F','U']){
  test(`three-value logic ${a},${b}`,()=>{
    assert.equal(evaluate({op:'ALL',args:[{op:'FACT',key:'a'},{op:'FACT',key:'b'}]},{a,b}),a==='F'||b==='F'?'F':a==='U'||b==='U'?'U':'T');
    assert.equal(evaluate({op:'ANY',args:[{op:'FACT',key:'a'},{op:'FACT',key:'b'}]},{a,b}),a==='T'||b==='T'?'T':a==='U'||b==='U'?'U':'F');
  });
}
test('unknown is not negative evidence',()=>assert.equal(evaluate({op:'NOT',arg:fact},{}),'U'));
test('empty conjunction rejected',()=>assert.throws(()=>parseExpr({op:'ALL',args:[]}),/INVALID_RULE_ARGS/));
test('arbitrary JS operator rejected',()=>assert.throws(()=>parseExpr({op:'EVAL',code:'true'}),/UNKNOWN_OPERATOR/));
test('deep AST rejected',()=>{let e=fact;for(let i=0;i<30;i++)e={op:'NOT',arg:e};assert.throws(()=>parseExpr(e),/RULE_BUDGET/);});
test('unexpected rule fields rejected',()=>assert.throws(()=>parseExpr({...fact,score:9}),/UNEXPECTED_FIELD/));
test('numeric truth rejected',()=>assert.throws(()=>parseFacts({x:-1}),/INVALID_TRUTH/));
test('untrusted extra observation field rejected',()=>assert.throws(()=>parseObservation({...obs(1),confidence:1}),/UNEXPECTED_FIELD/));
test('invalid revision rejected',()=>assert.throws(()=>parseObservation({...obs(1),revision:1.2}),/INVALID_REVISION/));
const item={id:'q',outputKeys:['result'],options:[{id:'action',facts:{result:'T'}},{id:'other',facts:{result:'F'}}]};
test('stable option IDs, not positions',()=>assert.deepEqual(scoreAnswer(item,{kind:'CHOICE',optionId:'action'}),scoreAnswer({...item,options:[...item.options].reverse()},{kind:'CHOICE',optionId:'action'})));
for(const reason of ['SKIPPED','NO_EXPERIENCE','NO_OPPORTUNITY','UNCLEAR','NONE_FITS','NOT_APPLICABLE']){
  test(`missing ${reason} does not score zero`,()=>assert.deepEqual(scoreAnswer(item,{kind:'MISSING',reason}),{result:'U'}));
}
test('client score rejected',()=>assert.throws(()=>scoreAnswer(item,{kind:'CHOICE',optionId:'action',score:3}),/UNEXPECTED_FIELD/));
test('free text not an inference input',()=>assert.throws(()=>scoreAnswer(item,{kind:'CHOICE',optionId:'action',text:'a personal note'}),/UNEXPECTED_FIELD/));
test('unknown option rejected',()=>assert.throws(()=>scoreAnswer(item,{kind:'CHOICE',optionId:'wrong'}),/UNKNOWN_OPTION/));
test('duplicate option IDs rejected',()=>assert.throws(()=>scoreAnswer({...item,options:[item.options[0],item.options[0]]},{kind:'CHOICE',optionId:'action'}),/DUPLICATE_OPTION/));
test('network repeat is one root',()=>assert.equal(canonicalRoots([obs(1),obs(1)],scope).length,1));
test('new questionnaire about same event is not new episode',()=>assert.equal(canonicalRoots([obs(1),obs(1,'T',{sourceId:'different'})],scope).length,1));
test('latest correction replaces, not adds',()=>{
  const x=obs(1),y=obs(1,'F',{revision:2});
  assert.deepEqual(canonicalRoots([x,y],scope),canonicalRoots([y,x],scope));
  assert.equal(summarize(canonicalRoots([x,y],scope),'M',fact).no,1);
});
test('different payload same revision conflicts',()=>assert.throws(()=>canonicalRoots([obs(1),obs(1,'F')],scope),/REVISION_COLLISION/));
test('same source cannot silently change subject',()=>assert.throws(()=>canonicalRoots([obs(1),obs(1,'T',{revision:2,subjectId:'other'})],scope),/SOURCE_IDENTITY_CHANGED/));
test('contradictory reports about same episode remain unknown',()=>{
  const r=canonicalRoots([obs(1),obs(1,'F',{sourceId:'s2'})],scope);
  assert.equal(r[0].facts.result,'U');assert.deepEqual(r[0].disputedKeys,['result']);assert.equal(summarize(r,'M',fact).unknown,1);
});
test('same root cannot multiply scenario families',()=>assert.throws(()=>canonicalRoots([obs(1),obs(1,'T',{sourceId:'s2',familyId:'new'})],scope),/ROOT_FAMILY_COLLISION/));
for(const [key,value] of [['contextKey','new-pair'],['windowId','different-window'],['track','TASK'],['phase','ASSISTED'],['instrumentVersion','new-rubric']]){
  test(`stratification: ${key} not pooled`,()=>assert.equal(canonicalRoots([obs(1),obs(2,'T',{[key]:value})],scope).length,1));
}
test('two partial actions in different episodes do not compose a full action',()=>{
 const inputs=[obs(1,'U',{facts:{'M:eligible':'T',a:'T'}}),obs(2,'U',{facts:{'M:eligible':'T',b:'T'}})];
 assert.equal(summarize(canonicalRoots(inputs,scope),'M',allFacts(['a','b'])).yes,0);
});
test('3 of 8 adverse episodes = -0.375, not negative skill ability',()=>{
 const s=summary(['T','T','T','F','F','F','F','F']);assert.equal(s.signedRate,-.375);assert.deepEqual(s.signedBounds,[-.375,-.375]);
});
test('unknown outcome gives set-identified signed range',()=>{
 const s=summary(['T','T','T','F','F','F','F','U']);assert.equal(s.rate,null);assert.deepEqual(s.bounds,[3/8,4/8]);assert.deepEqual(s.signedBounds,[-4/8,-3/8]);
});
test('no observations = no score',()=>{assert.equal(summary([]).rate,null);assert.equal(summary([]).signedRate,null);});
test('zero reported events is a sampled zero, not safety certificate',()=>{
 const r=evaluatePattern(roots(['F','F','F','F']),{id:'M',predicate:fact,impactKind:'HARM',protectiveRouteOnReportedMatch:true},scope);
 assert.equal(r.evidence.signedRate,0);assert.equal(r.canCertifySafety,false);
});
test('known event survives unknown denominator',()=>{
 const r=canonicalRoots([obs(1,'T',{facts:{'M:eligible':'U',result:'T'}})],scope),s=summarize(r,'M',fact);
 assert.equal(s.rate,null);assert.equal(s.occurrenceRoots.length,1);
});
test('no opportunity does not become failure',()=>{
 const s=summarize(canonicalRoots([obs(1,'U',{facts:{'M:eligible':'F',result:'U'}})],scope),'M',fact);
 assert.equal(s.no,0);assert.equal(s.denominator,0);assert.equal(s.rate,null);
});
test('impossible eligibility contradiction rejected',()=>assert.throws(()=>summarize(canonicalRoots([obs(1,'T',{facts:{'M:eligible':'F',result:'T'}})],scope),'M',fact),/ELIGIBILITY_CONTRADICTION/));
test('unrelated measure does not inflate denominator',()=>assert.equal(summarize(canonicalRoots([obs(1),obs(2,'T',{measureIds:['OTHER']})],scope),'M',fact).denominator,1));
test('authored 3/4 threshold, not guessed latent confidence',()=>assert.equal(decide(summary(['T','T','T','F']),DEMO_POLICY),'MET'));
test('clear criterion not reached under same authored threshold',()=>assert.equal(decide(summary(['T','F','F','F']),DEMO_POLICY),'NOT_MET'));
test('insufficient roots do not yield level0',()=>assert.equal(decide(summary(['F']),DEMO_POLICY),'UNRESOLVED'));
test('unknown values cannot be silently counted as failures',()=>assert.equal(decide(summary(['T','T','F','F','U','U','U','U']),DEMO_POLICY),'UNRESOLVED'));
test('unknown first criterion yields unknown level, not level0',()=>{
 const s=resolveLevels(['UNRESOLVED','UNRESOLVED','UNRESOLVED']);assert.equal(s.exactLevel,null);assert.equal(s.status,'UNKNOWN');
});
test('evidenced failure at basic criterion permits rubric L0',()=>assert.equal(resolveLevels(['NOT_MET','NOT_MET','NOT_MET']).exactLevel,0));
test('L2 lower bound is not fictitious exact L2',()=>{
 const s=resolveLevels(['MET','MET','UNRESOLVED']);assert.equal(s.exactLevel,null);assert.deepEqual(s.possibleLevels,[2,3]);
});
test('criterion conflict not averaged into a level',()=>assert.equal(resolveLevels(['NOT_MET','MET','UNRESOLVED']).status,'INCONSISTENT_EVIDENCE'));
test('explicitly nonnested rubric rejected',()=>assert.throws(()=>validateRubric({...REQUEST_RUBRIC,cumulativeFacts:[['a'],['b'],['a','b']]}),/NON_NESTED/));
function requestRows(){return Array.from({length:4},(_,i)=>obs(i,'U',{measureIds:['COM.S02'],facts:Object.fromEntries([['COM.S02:eligible','T'],...REQUEST_RUBRIC.cumulativeFacts[2].map(k=>[k,'T'])])}));}
test('full authored example yields level3 for this source track',()=>assert.equal(evaluateSkill(canonicalRoots(requestRows(),scope),REQUEST_RUBRIC).exactLevel,3));
test('one severe event cannot be offset by many other answers',()=>{
 const rows=Array.from({length:100},(_,i)=>obs(i,i===0?'T':'F'));
 const p=evaluatePattern(canonicalRoots(rows,scope),{id:'M',predicate:fact,impactKind:'PHYSICAL_HARM',protectiveRouteOnReportedMatch:true},scope);
 assert.equal(p.evidence.rate,.01);assert.equal(p.protectiveRoute,true);assert.equal(p.canOffsetByPositiveSkills,false);
});
test('a harmful hypothetical choice is not an alleged real event',()=>{
 const s={...scope,track:'TASK'},r=canonicalRoots([obs(1,'T',{track:'TASK'})],s);
 const p=evaluatePattern(r,{id:'M',predicate:fact,impactKind:'HARM',protectiveRouteOnReportedMatch:true},s);
 assert.equal(p.protectiveRoute,false);assert.equal(p.sourceMeaning,'CHOICE_IN_TASK');
});
test('one repeated source is not repeated behaviour',()=>{
 const p=evaluatePattern(canonicalRoots([obs(1),obs(1)],scope),{id:'M',predicate:fact,impactKind:'HARM',protectiveRouteOnReportedMatch:false},scope);
 assert.equal(p.occurrenceState,'REPORTED_OCCURRENCE');
});
test('two episodes mark descriptive repetition only',()=>assert.equal(evaluatePattern(roots(['T','T']),{id:'M',predicate:fact,impactKind:'HARM',protectiveRouteOnReportedMatch:false},scope).occurrenceState,'REPEATED_IN_DESCRIBED_EPISODES'));
const a={kind:'ORDINARY_TASK',validVoluntaryAgreement:'T',dueOpportunity:'T',completed:'F',timelyReleaseOrRenegotiation:'F',resourceConstraint:'F',safeFeasibleManagementAction:'U',managementActionOmitted:'U'};
test('missing ability, breach and harm are not equated',()=>assert.equal(classifyAgreement(a),'NONFULFILLED_CAUSE_NOT_ESTABLISHED'));
test('timely renegotiation is not a failure',()=>assert.equal(classifyAgreement({...a,timelyReleaseOrRenegotiation:'T'}),'RELEASED_OR_RENEGOTIATED'));
test('illness/resource constraint not attributed intent',()=>assert.equal(classifyAgreement({...a,resourceConstraint:'T'}),'NONFULFILLED_WITH_CONSTRAINT'));
test('safe available management action omitted is a separate fact',()=>assert.equal(classifyAgreement({...a,safeFeasibleManagementAction:'T',managementActionOmitted:'T'}),'NONFULFILLED_WITH_MANAGEMENT_OMISSION'));
test('no voluntary agreement = no breach',()=>assert.equal(classifyAgreement({...a,validVoluntaryAgreement:'F'}),'NO_VALID_AGREEMENT'));
for(const kind of ['INTIMATE_ACT','PERSONAL_DISCLOSURE'])test(`withdrawal of ${kind} is not breached obligation`,()=>assert.equal(classifyAgreement({...a,kind}),'OUT_OF_SCOPE_NO_OBLIGATION_TO_CONSENT'));
test('next question targets uncertainty, not improving apparent score',()=>assert.equal(nextCriterion(['MET','UNRESOLVED','NOT_MET']),2));
test('no unnecessary question when all criteria resolved',()=>assert.equal(nextCriterion(['MET','MET','NOT_MET']),null));
test('bounds contain all completions for small finite samples (exhaustive)',()=>{
 for(let y=0;y<=5;y++)for(let f=0;f<=5;f++)for(let u=0;u<=5;u++){
  const n=y+f+u;if(!n)continue;
  const s=summary([...Array(y).fill('T'),...Array(f).fill('F'),...Array(u).fill('U')]);
  for(let extra=0;extra<=u;extra++){const r=(y+extra)/n;assert.ok(r>=s.bounds[0]&&r<=s.bounds[1]);assert.ok(-r>=s.signedBounds[0]&&-r<=s.signedBounds[1]);}
 }
});
test('adding unrelated positive evidence cannot change a negative measure',()=>{
 const before=summarize(canonicalRoots([obs(1)],scope),'M',fact);
 const after=summarize(canonicalRoots([obs(1),obs(2,'T',{measureIds:['POSITIVE']})],scope),'M',fact);
 assert.deepEqual(before,after);
});
test('all 27 authored negative predicates pass runtime parsing and decisive cases',()=>{
 const {patterns}=JSON.parse(readFileSync(new URL('../../src/domain/assessment/catalog/negative_patterns.v0_2.json',import.meta.url),'utf8'));
 assert.equal(patterns.length,27);
 for(const p of patterns){
  const e=parseExpr(p.predicate),fs=Object.fromEntries(p.requiredFacts.map(f=>[f.key,'T']));assert.equal(evaluate(e,fs),'T');
  for(const f of p.requiredFacts){assert.equal(evaluate(e,{...fs,[f.key]:'F'}),'F');assert.equal(evaluate(e,{...fs,[f.key]:'U'}),'U');}
  assert.equal(evaluate(e,{}),'U');
 }
});
test('all 54 source skills preserved; all new negative links resolve',()=>{
 const {skills,nonSkillDefinitionsPreserved}=JSON.parse(readFileSync(new URL('../../src/domain/assessment/catalog/skill_bindings.v0_2.json',import.meta.url),'utf8'));
 const {patterns}=JSON.parse(readFileSync(new URL('../../src/domain/assessment/catalog/negative_patterns.v0_2.json',import.meta.url),'utf8'));
 const ids=new Set(patterns.map(p=>p.id));assert.equal(skills.length,54);assert.equal(nonSkillDefinitionsPreserved.length,47);
 for(const s of skills){assert.equal(s.id,s.sourceDefinition.id);assert.equal(s.proposal.automaticInverseSkill,false);for(const p of s.proposal.negativePatternIds)assert.ok(ids.has(p));}
 for(const r of RUBRICS)validateRubric(r);
});
test('knowledge responses remain separate from task performance',()=>assert.equal(canonicalRoots([obs(1),obs(2,'T',{track:'KNOWLEDGE'})],scope).length,1));
test('hypothetical knowledge response is not a real harm report',()=>{
 const s={...scope,track:'KNOWLEDGE'},r=canonicalRoots([obs(1,'T',{track:'KNOWLEDGE'})],s);
 assert.equal(evaluatePattern(r,{id:'M',predicate:fact,impactKind:'HARM',protectiveRouteOnReportedMatch:true},s).protectiveRoute,false);
});
import {scoreSubmission} from '../../src/domain/assessment/engine/core.ts';
const publication={id:'questionnaire',version:'v1',items:[{...item,rootSlotId:'episode'}]};
const trusted={...scope,sourcePrefix:'run',revision:1,presentedItemIds:['q'],slots:{episode:{rootId:'real-episode-ref',familyId:'f1',measureIds:['M'],applicabilityFacts:{'M:eligible':'T'}}}};
test('end-to-end questionnaire response changes calculated profile component',()=>{
 const r=scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[{itemId:'q',response:{kind:'CHOICE',optionId:'action'}}]},trusted);
 assert.equal(summarize(canonicalRoots(r.observations,scope),'M',fact).rate,1);
});
test('questionnaire edits to skip retract old evidence, preserving missing reason',()=>{
 const r1=scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[{itemId:'q',response:{kind:'CHOICE',optionId:'action'}}]},trusted);
 const r2=scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[{itemId:'q',response:{kind:'MISSING',reason:'SKIPPED'}}]},{...trusted,revision:2});
 const s=summarize(canonicalRoots([...r1.observations,...r2.observations],scope),'M',fact);
 assert.equal(s.rate,null);assert.equal(s.yes,0);assert.equal(s.unknown,1);assert.equal(r2.participation[0].reason,'SKIPPED');
});
test('client cannot inject owner identity into submission',()=>assert.throws(()=>scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[],ownerId:'other'},trusted),/UNEXPECTED_FIELD/));
test('answer to unpresented item rejected',()=>assert.throws(()=>scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[{itemId:'q',response:{kind:'CHOICE',optionId:'action'}}]},{...trusted,presentedItemIds:[]}),/ITEM_NOT_PRESENTED/));
test('unanswered presented item stays unknown, not skipped or no experience',()=>{
 const r=scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[]},trusted);
 assert.equal(r.participation[0].status,'NOT_ANSWERED');assert.equal(r.observations[0].facts.result,'U');
});
test('duplicate response for one question rejected',()=>assert.throws(()=>scoreSubmission(publication,{publicationId:'questionnaire',publicationVersion:'v1',answers:[{itemId:'q',response:{kind:'CHOICE',optionId:'action'}},{itemId:'q',response:{kind:'CHOICE',optionId:'other'}}]},trusted),/DUPLICATE_RESPONSE/));
test('inherited object properties are not evidence facts',()=>assert.equal(evaluate({op:'FACT',key:'toString'},{}),'U'));
test('missing option fact never reads Object prototype',()=>assert.deepEqual(scoreAnswer({id:'proto',outputKeys:['toString'],options:[{id:'x',facts:{}}]},{kind:'CHOICE',optionId:'x'}),{toString:'U'}));
