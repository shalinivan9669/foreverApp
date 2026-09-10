import assert from 'node:assert/strict';
import { BETA_APPLICATION_CLARIFICATION, BETA_PUBLICATIONS } from '../src/domain/assessment/content';
import { AssessmentResponseSchema, type AssessmentAnswerRecord, type AssessmentPublication, type AssessmentResponse } from '../src/domain/assessment/contracts';
import { assessmentPublicationHash, assessmentResponseFacts, compatibleAssessmentApplications, DOM_S07_PUBLICATION, getAssessmentPublication, listAssessmentPublications, parseAssessmentResponse, validateAssessmentPublication } from '../src/domain/assessment/publication';
import { computeAssessmentProfile, getAssessmentSkillAvailability } from '../src/domain/assessment/profile';
import { composeAssessmentSources, assessmentSourceSetIdentity, type AssessmentCompositionSource } from '../src/domain/assessment/sources';
import { planAssessmentNextStep } from '../src/domain/assessment/planner';
import { parseExpr, type Expr } from '../src/domain/assessment/engine/core';
import { betaAppliedPredicate } from '../src/domain/assessment/betaComparison';

const cases: Array<{ ids: string[]; assertion: string }> = [];
const check = (ids: string[], assertion: string, test: () => void) => { test(); cases.push({ ids, assertion }); };
const period = { id: 'beta-2026-08', startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-29T00:00:00.000Z' };
const now = new Date('2026-09-10T00:00:00.000Z');
const publication = (id: string) => { const found = getAssessmentPublication(id); assert.ok(found); return found; };
function supportedResponse(item: AssessmentPublication['items'][number]): AssessmentResponse {
  if (item.kind === 'OPTION') return { kind: 'OPTION', optionId: item.options[0].id };
  if (item.kind === 'STRUCTURED') return { kind: 'STRUCTURED', slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options[0].id])) };
  return { kind: 'FACTS', values: Object.fromEntries(item.fields.map(field => [field.id, !field.id.startsWith('NEG.') || field.id.endsWith('.eligible')])), episode: { observedAt: '2026-08-10T00:00:00.000Z' } };
}
function source(published: AssessmentPublication, sourceId = published.id): AssessmentCompositionSource {
  return { subjectId: 'beta-selfcheck', sourceId, revision: 1, generation: 0, period, publication: published, finalizedAt: '2026-08-29T12:00:00.000Z', permissionRevision: 0, pairUse: false, matchingUse: false, contextIdentity: 'INDIVIDUAL',
    answers: published.items.map((item, index): AssessmentAnswerRecord => ({ itemId: item.id, presentationId: `presentation-${index}`, response: supportedResponse(item), revision: index + 1, phase: 'BASELINE', recordedAt: '2026-08-29T11:00:00.000Z' })) };
}
const compose = (sources: AssessmentCompositionSource[], purpose: 'OWNER' | 'MATCHING' | 'PAIR' = 'OWNER') => composeAssessmentSources(sources, { purpose, sourceSetRevision: 5, now });
check(['BETA-009', 'BETA-010', 'BETA-011'], 'eleven frozen publications / nine core forms plus optional application clarification', () => {
  assert.equal(listAssessmentPublications().length, 11); assert.equal(BETA_PUBLICATIONS.length, 9);
  assert.equal(new Set(BETA_PUBLICATIONS.map(value => value.skillId)).size, 3);
  assert.equal(getAssessmentPublication(DOM_S07_PUBLICATION.id, DOM_S07_PUBLICATION.version), DOM_S07_PUBLICATION);
  assert.equal(getAssessmentPublication(DOM_S07_PUBLICATION.id, 'absent'), null);
  assert.notEqual(assessmentPublicationHash(DOM_S07_PUBLICATION), assessmentPublicationHash(BETA_PUBLICATIONS[0]));
});
check(['BETA-009', 'BETA-011', 'BETA-023', 'BETA-027'], 'optional application clarification has declared compatible pool and distinct immutable identity', () => {
  assert.equal(validateAssessmentPublication(BETA_APPLICATION_CLARIFICATION).items.length, 2);
  assert.equal(getAssessmentPublication(BETA_APPLICATION_CLARIFICATION.id), BETA_APPLICATION_CLARIFICATION);
  assert.equal(compatibleAssessmentApplications(BETA_APPLICATION_CLARIFICATION, publication('dom-s07-application-beta')), true);
  assert.equal(compatibleAssessmentApplications(BETA_APPLICATION_CLARIFICATION, DOM_S07_PUBLICATION), false);
  assert.notEqual(assessmentPublicationHash(BETA_APPLICATION_CLARIFICATION), assessmentPublicationHash(publication('dom-s07-application-beta')));
  const partial = computeAssessmentProfile(source(BETA_APPLICATION_CLARIFICATION)).skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(partial.A.observationCount, 2); assert.equal(partial.A.exactLevel, null);
});
check(['BETA-117'], 'all beta metadata declares author policy method purpose and bounded observation frame', () => {
  for (const published of [...BETA_PUBLICATIONS, BETA_APPLICATION_CLARIFICATION]) {
    assert.equal(published.policyStatus, 'AUTHOR_POLICY_NOT_CALIBRATED'); assert.equal(published.metadata!.contentReview, 'INTERNAL_AUTHOR_REVIEW');
    assert.equal(published.metadata!.interpretationVersion, 'author-beta-v1');
    const applied = published.items.every(item => item.method === 'SELF_REPORT');
    assert.equal(published.metadata!.samplingFrame, applied ? 'SELECTED_DESCRIBED_EPISODES' : 'ASSIGNED_SCENES');
    assert.deepEqual(published.metadata!.allowedPurposes, applied ? ['OWNER', 'PAIR', 'MATCHING'] : ['OWNER']);
    assert.equal(published.metadata!.freshnessDays, 90);
  }
});
for (const published of BETA_PUBLICATIONS) {
  check(['BETA-012', 'BETA-016'], `${published.id}: strict structural validation and missing endings`, () => {
    assert.equal(validateAssessmentPublication(published).items.length, published.items[0].method === 'TASK' ? 8 : 4);
    for (const item of published.items) for (const reason of ['SKIPPED', 'NO_EXPERIENCE', 'NO_OPPORTUNITY', 'UNCLEAR', 'NONE_FITS', 'NOT_APPLICABLE'] as const) assert.deepEqual(parseAssessmentResponse(item, { kind: 'MISSING', reason }), { kind: 'MISSING', reason });
    assert.throws(() => validateAssessmentPublication({ ...published, items: [...published.items, published.items[0]] }));
    assert.throws(() => validateAssessmentPublication({ ...published, items: published.items.map((item, index) => index ? item : { ...item, dependsOn: { itemId: published.items.at(-1)!.id, optionId: 'x' } }) }));
    const missing = computeAssessmentProfile({ ...source(published), answers: source(published).answers.map(answer => ({ ...answer, response: { kind: 'MISSING' as const, reason: 'NO_EXPERIENCE' as const } })) });
    assert.ok(missing.skills.every(skill => skill.K.exactLevel === null && skill.D.exactLevel === null && skill.A.exactLevel === null));
  });
  if (published.items[0].kind === 'STRUCTURED') check(['BETA-013', 'BETA-014', 'BETA-040'], `${published.id}: strict slot assembly and method boundary`, () => {
    const item = published.items[0]; const response = supportedResponse(item); assert.equal(response.kind, 'STRUCTURED'); if (response.kind !== 'STRUCTURED') return;
    assert.throws(() => parseAssessmentResponse(item, { ...response, slots: { ...response.slots, invented: 'plan' } }));
    assert.throws(() => parseAssessmentResponse(item, { ...response, slots: { ...response.slots, [item.slots![0].id]: 'invented' } }));
    assert.throws(() => parseAssessmentResponse(item, { ...response, note: 'A very long explanation is not scoring input' }));
    const altered = { ...response, slots: { ...response.slots, [item.slots![0].id]: 'other' } };
    assert.ok(Object.values(assessmentResponseFacts(item, altered)).includes('F'));
    const snapshot = computeAssessmentProfile(source(published)).skills.find(skill => skill.skillId === published.skillId)!;
    assert.equal(snapshot.A.exactLevel, null); assert.equal(snapshot.K.exactLevel, null); assert.equal(snapshot.D.method, 'TASK');
    assert.equal(snapshot.CMinus.occurrenceState, 'UNKNOWN');
    if (published.skillId === 'DOM.S07' || published.skillId === 'COM.S04') assert.equal(betaAppliedPredicate(computeAssessmentProfile(source(published)), published.skillId), 'U');
  });
}
check(['BETA-013', 'BETA-044'], 'unsupported ranges/order/multi and nonfinite typed values rejected', () => {
  for (const value of [{ kind: 'MULTI', optionIds: ['a'] }, { kind: 'ORDERED', optionIds: ['a'] }, { kind: 'FACTS', values: { eligible: Number.NaN } }, { kind: 'FACTS', values: { eligible: [2, 4] } }]) assert.equal(AssessmentResponseSchema.safeParse(value).success, false);
});
check(['BETA-012'], 'author config rejects unknown fact keys empty ALL and excessive AST depth before scoring', () => {
  const published = publication('dom-s07-knowledge-beta');
  for (const facts of [{ 'unknown:criterion': 'T' }, {}]) assert.throws(() => validateAssessmentPublication({ ...published, items: published.items.map((item, index) => index ? item : { ...item, options: [{ id: 'invalid', label: 'Invalid configuration', facts }] }) }));
  assert.throws(() => parseExpr({ op: 'ALL', args: [] }));
  assert.throws(() => parseExpr({ op: 'invented', args: [] }));
  let deep: Expr = { op: 'FACT', key: 'DOM.S07:planned' };
  for (let level = 0; level < 30; level++) deep = { op: 'NOT', arg: deep };
  assert.throws(() => parseExpr(deep), /RULE_BUDGET_EXCEEDED/);
});
for (const published of [...BETA_PUBLICATIONS, BETA_APPLICATION_CLARIFICATION]) check(['BETA-040'], `${published.id}: label grammar length and option slot order do not change ID-based result`, () => {
  const original = source(published);
  const changed: AssessmentPublication = { ...published, title: 'Другая длина заголовка и грамматика', items: published.items.map(item => ({ ...item, title: `Переформулированная подпись ${item.id}`, instructions: 'Та же семантика предъявленных блоков, другая длина текста.', fields: [...item.fields].reverse().map(field => ({ ...field, label: 'Та же типизированная характеристика' })), options: [...item.options].reverse().map(option => ({ ...option, label: 'Иная формулировка того же варианта' })), ...(item.slots ? { slots: [...item.slots].reverse().map(slot => ({ ...slot, label: 'Тот же раздел плана', options: [...slot.options].reverse().map(option => ({ ...option, label: 'Тот же блок действия' })) })) } : {}) })) };
  assert.deepEqual(computeAssessmentProfile({ ...original, publication: changed }).skills, computeAssessmentProfile(original).skills);
});
check(['BETA-015'], 'request no common alternative stays unknown; no fabricated second agreement', () => {
  const request = publication('com-s02-task-beta').items.at(-1)!; const response = supportedResponse(request); assert.equal(response.kind, 'STRUCTURED'); if (response.kind !== 'STRUCTURED') return;
  assert.equal(assessmentResponseFacts(request, { ...response, slots: { ...response.slots, alternative: 'stop' } })['COM.S02:alternativeFeasible'], 'U');
  for (const item of publication('com-s04-task-beta').items.filter(item => !item.dependsOn).slice(0, 2)) {
    const facts = assessmentResponseFacts(item, supportedResponse(item)); assert.equal(facts['COM.S04:returnMethodAgreed'], 'U'); assert.equal(facts['COM.S04:returnTimeOrConditionAgreed'], 'U');
  }
});
check(['BETA-016'], 'authored accessible household alternatives retain supported facts without manual execution or memory penalty', () => {
  const published = publication('dom-s07-task-beta');
  const original = source(published);
  const accessible = { ...original, answers: original.answers.map(answer => {
    const item = published.items.find(item => item.id === answer.itemId)!;
    if (answer.response.kind !== 'STRUCTURED') throw new Error('STRUCTURED_FIXTURE_REQUIRED');
    return { ...answer, response: { kind: 'STRUCTURED' as const, slots: Object.fromEntries(item.slots!.map(slot => [slot.id, slot.options.some(option => option.id === 'accessible') ? 'accessible' : answer.response.kind === 'STRUCTURED' ? answer.response.slots[slot.id] : ''])) } };
  }) };
  assert.deepEqual(computeAssessmentProfile(accessible).skills, computeAssessmentProfile(original).skills);
});
check(['BETA-017'], 'unavailable original skills retain definition and unknown', () => { assert.equal(getAssessmentSkillAvailability('DOM.S01')?.reason, 'UNAVAILABLE_RUBRIC'); assert.ok(getAssessmentSkillAvailability('DOM.S01')?.definition); });
const application = source(publication('dom-s07-application-beta'));
application.answers = application.answers.map(answer => answer.response.kind !== 'FACTS' ? answer : ({ ...answer, response: { ...answer.response, values: Object.fromEntries(Object.entries(answer.response.values).map(([id, value]) => [id, id === 'planned' ? false : id.startsWith('NEG.AGR.01.') ? true : value])) } }));
check(['BETA-019', 'BETA-020'], 'independent K3 D3 preserve A1 and negative occurrence period', () => {
  const a = compose([application])!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  const combined = compose([application, source(publication('dom-s07-knowledge-beta')), source(publication('dom-s07-task-beta'))])!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(a.A.exactLevel, 1); assert.equal(combined.K.exactLevel, 3); assert.equal(combined.D.exactLevel, 3); assert.equal(combined.A.exactLevel, 1);
  assert.deepEqual(combined.CMinus, a.CMinus); assert.equal(combined.CMinus.evidence.signedRate, -1); assert.deepEqual(combined.A.provenance?.period, period);
});
check(['BETA-022', 'BETA-023'], 'correction missing replaces old T; same lineage deduplicates roots', () => {
  const duplicate = source(application.publication, 'same-episode-copy');
  duplicate.answers = duplicate.answers.map((answer, index) => answer.response.kind !== 'FACTS' ? answer : ({ ...answer, response: { ...answer.response, episode: { observedAt: '2026-08-10T00:00:00.000Z', sameEpisodeRootId: `beta-selfcheck:${period.id}:round:0:${application.publication.id}:${application.publication.items[index].rootSlot}` } } }));
  const result = compose([source(application.publication), duplicate])!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(result.A.observationCount, 4); assert.equal(result.A.result.criteria[0].evidence.denominator, 4);
  const correction = source(application.publication); correction.answers = correction.answers.map((answer, index) => index ? answer : { ...answer, revision: 20, response: { kind: 'MISSING', reason: 'SKIPPED' } });
  assert.equal(compose([correction])!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, null);
});
check(['BETA-024', 'BETA-027'], 'new unknown period does not renew old level; expired component remains dated history', () => {
  const newer = { ...source(application.publication, 'new-wave'), period: { id: 'september', startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-09T00:00:00.000Z' }, finalizedAt: '2026-09-09T01:00:00.000Z', answers: [] };
  const skill = compose([application, newer])!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(skill.A.exactLevel, null); assert.equal(skill.A.provenance?.period.id, 'september'); assert.equal(skill.A.history?.length, 2); assert.equal(skill.A.history?.[1].exactLevel, 1);
  assert.equal(skill.negativeHistory?.[1].CMinus.evidence.signedRate, -1);
  const expired = composeAssessmentSources([application], { purpose: 'OWNER', sourceSetRevision: 5, now: new Date('2027-01-01') })!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(expired.A.exactLevel, null); assert.equal(expired.A.provenance?.freshness, 'EXPIRED'); assert.equal(expired.A.history?.[0].exactLevel, 1);
});
check(['BETA-023'], 'conflicting same-root allowed sources remain unknown with dispute provenance', () => {
  const first = source(application.publication), second = source(application.publication, 'contradictory-copy');
  second.answers = second.answers.map(answer => answer.response.kind !== 'FACTS' ? answer : ({ ...answer, response: { ...answer.response, values: { ...answer.response.values, planned: false } } }));
  const skill = compose([first, second])!.skills.find(skill => skill.skillId === 'DOM.S07')!;
  assert.equal(skill.A.exactLevel, null); assert.equal(skill.A.observationCount, 4); assert.ok(skill.A.provenance!.disputedFactCount > 0);
});
check(['BETA-026', 'BETA-028', 'BETA-084'], 'purpose before arithmetic / permissions no oracle / previous pair not portable', () => {
  const allowed = { ...source(application.publication), matchingUse: true, pairUse: true };
  const privateKnowledge = source(publication('dom-s07-knowledge-beta'));
  const external = compose([allowed, privateKnowledge], 'MATCHING')!;
  assert.equal(external.skills.find(skill => skill.skillId === 'DOM.S07')?.K.exactLevel, null);
  assert.equal(external.skills.find(skill => skill.skillId === 'DOM.S07')?.CMinus.occurrenceState, 'UNKNOWN');
  assert.deepEqual(external, compose([{ ...allowed }, { ...privateKnowledge, revision: 20 }], 'MATCHING'));
  assert.equal(compose([{ ...allowed, contextIdentity: 'PAIR:old' }], 'MATCHING'), null);
  assert.equal(composeAssessmentSources([{ ...allowed, contextIdentity: 'PAIR:old' }], { purpose: 'PAIR', relationshipId: 'new', sourceSetRevision: 1 }), null);
  assert.equal(assessmentSourceSetIdentity([allowed], 'MATCHING'), external.sourceSetIdentity);
  const changedNegative = { ...allowed, revision: 30, answers: allowed.answers.map(answer => answer.response.kind !== 'FACTS' ? answer : ({ ...answer, revision: answer.revision + 30, response: { ...answer.response, values: Object.fromEntries(Object.entries(answer.response.values).map(([key, value]) => [key, key.startsWith('NEG.AGR.01.') ? true : value])) } })) };
  assert.equal(assessmentSourceSetIdentity([changedNegative], 'MATCHING'), assessmentSourceSetIdentity([allowed], 'MATCHING'));
  const privateCounterexample = { ...application, sourceId: 'private-counterexample' };
  assert.equal(compose([allowed, privateCounterexample])!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, null);
  assert.equal(compose([allowed, privateCounterexample], 'MATCHING')!.skills.find(skill => skill.skillId === 'DOM.S07')!.A.exactLevel, 3);
  assert.deepEqual(compose([allowed, privateCounterexample], 'MATCHING'), compose([allowed], 'MATCHING'));
});
check(['BETA-034', 'BETA-035'], 'planner offers one module and does not repeat declined topic forever', () => {
  const publications = listAssessmentPublications().map(publication => ({ ...publication, runStatus: 'NEW' as const, declined: false }));
  const state = { goal: 'DATING' as const, publications, profile: { version: 'assessment-profile-v1' as const, status: 'NOT_STARTED' as const, snapshot: null } };
  const next = planAssessmentNextStep(state); assert.equal(next.publicationId, 'com-s02-knowledge-beta');
  const declined = planAssessmentNextStep({ ...state, publications: publications.map(publication => ({ ...publication, declined: publication.skillId === 'COM.S02' })) });
  assert.equal(declined.publicationId, null);
});
for (const [goal, skill] of [['SELF', 'DOM.S07'], ['DATING', 'COM.S02'], ['COUPLE', 'COM.S04']] as const) check(['BETA-035'], `${goal}: planner resume knowledge task enough declined and unavailable matrix`, () => {
  const publications = listAssessmentPublications().map(publication => ({ ...publication, runStatus: 'NEW' as 'NEW' | 'DRAFT' | 'FINALIZED', declined: false }));
  const state = { goal, publications, profile: { version: 'assessment-profile-v1' as const, status: 'NOT_STARTED' as const, snapshot: null } };
  const knowledge = publications.find(publication => publication.skillId === skill && publication.id.endsWith('-knowledge-beta'))!, task = publications.find(publication => publication.skillId === skill && publication.id.endsWith('-task-beta'))!;
  assert.equal(planAssessmentNextStep(state).publicationId, knowledge.id); assert.equal(planAssessmentNextStep(state).reasonCode, 'GOAL_RELEVANT_UNKNOWN');
  const resume = planAssessmentNextStep({ ...state, publications: publications.map(publication => publication.id === task.id ? { ...publication, runStatus: 'DRAFT' } : publication) }); assert.equal(resume.publicationId, task.id); assert.equal(resume.reasonCode, 'RESUME_DRAFT');
  const afterKnowledge = publications.map(publication => publication.id === knowledge.id ? { ...publication, runStatus: 'FINALIZED' as const } : publication);
  assert.equal(planAssessmentNextStep({ ...state, publications: afterKnowledge }).publicationId, task.id); assert.equal(planAssessmentNextStep({ ...state, publications: afterKnowledge }).reasonCode, 'TASK_CLARIFICATION');
  const enough = planAssessmentNextStep({ ...state, publications: afterKnowledge.map(publication => publication.id === task.id ? { ...publication, runStatus: 'FINALIZED' } : publication) }); assert.equal(enough.publicationId, null); assert.equal(enough.reasonCode, 'ENOUGH_FOR_SELECTED_GOAL');
  const declined = planAssessmentNextStep({ ...state, publications: publications.map(publication => ({ ...publication, declined: publication.skillId === skill })) }); assert.equal(declined.publicationId, null); assert.equal(declined.reasonCode, 'DECLINED_OR_UNAVAILABLE');
  assert.equal(planAssessmentNextStep({ ...state, publications: [] }).reasonCode, 'DECLINED_OR_UNAVAILABLE');
});
process.stdout.write(`${JSON.stringify({ suite: 'beta-content', status: 'passed', checks: cases.length, cases })}\n`);
