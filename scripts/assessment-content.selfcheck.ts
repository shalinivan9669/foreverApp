import assert from 'node:assert/strict';
import { AssessmentAnswerInputSchema, type AssessmentAnswerRecord, type AssessmentItem, type AssessmentResponse } from '../src/domain/assessment/contracts';
import { computeAssessmentProfile, getAssessmentSkillAvailability } from '../src/domain/assessment/profile';
import { DOM_S07_PUBLICATION, parseAssessmentResponse, validateAssessmentPublication } from '../src/domain/assessment/publication';

let checks = 0;
const check = (callback: () => void) => { callback(); checks += 1; };
const period = { id: 'window-2026-08', startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-29T00:00:00.000Z' };
const input = { subjectId: 'synthetic-owner', sourceId: 'assessment-source:synthetic', revision: 1, generation: 0, period };
const item = (id: string): AssessmentItem => {
  const found = DOM_S07_PUBLICATION.items.find(value => value.id === id);
  assert.ok(found); return found;
};
const record = (itemId: string, response: AssessmentResponse, revision = 1): AssessmentAnswerRecord => ({
  itemId, response, revision, presentationId: `presentation-${itemId}`, phase: 'BASELINE', recordedAt: '2026-08-29T00:00:00.000Z',
});
function episodeAnswers(negative = false): AssessmentAnswerRecord[] {
  return DOM_S07_PUBLICATION.items.filter(value => value.method === 'SELF_REPORT').map(value => record(value.id,
    value.kind === 'OPTION' ? { kind: 'OPTION', optionId: 'HAS_EPISODE' } : {
      kind: 'FACTS', values: Object.fromEntries(value.fields.map(field => [field.id, field.factKey.startsWith('DOM.S07:') || field.factKey.endsWith(':eligible') || negative])),
    }));
}
const snapshot = (answers: AssessmentAnswerRecord[]) => computeAssessmentProfile({ ...input, answers });
const household = (answers: AssessmentAnswerRecord[]) => snapshot(answers).skills.find(skill => skill.skillId === 'DOM.S07')!;

check(() => assert.equal(validateAssessmentPublication(DOM_S07_PUBLICATION).items.length, 10));
check(() => assert.equal(DOM_S07_PUBLICATION.items[0].method, 'SELF_REPORT'));
check(() => assert.equal(DOM_S07_PUBLICATION.items.at(-1)?.method, 'KNOWLEDGE'));
check(() => assert.ok(DOM_S07_PUBLICATION.items.find(value => value.method === 'TASK')?.exposureFor?.includes('meals-first-facts')));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, items: [...DOM_S07_PUBLICATION.items, DOM_S07_PUBLICATION.items[0]] })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, terminalItemId: 'absent' })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, maxItems: 1 })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, items: DOM_S07_PUBLICATION.items.map(value => value.id === 'meals-first-facts' ? { ...value, familyId: 'invented-family' } : value) })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, rule: { op: 'ALL', args: [] } })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, items: DOM_S07_PUBLICATION.items.map(value => value.id === 'knowledge-cycle' ? { ...value, options: [{ id: 'empty', label: 'Empty', facts: {} }] } : value) })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, items: DOM_S07_PUBLICATION.items.map(value => value.id === 'knowledge-cycle' ? { ...value, options: [{ id: 'unknown', label: 'Unknown', facts: { 'unknown:field': 'T' } }] } : value) })));
check(() => assert.throws(() => validateAssessmentPublication({ ...DOM_S07_PUBLICATION, items: DOM_S07_PUBLICATION.items.map(value => value.dependsOn ? { ...value, dependsOn: { itemId: 'absent', optionId: 'HAS_EPISODE' } } : value) })));
check(() => assert.throws(() => parseAssessmentResponse(item('knowledge-cycle'), { kind: 'OPTION', optionId: 'absent' })));
check(() => assert.throws(() => parseAssessmentResponse(item('knowledge-cycle'), { kind: 'OPTION', optionId: 'full-cycle', owner: 'other' })));
check(() => assert.throws(() => parseAssessmentResponse(item('knowledge-cycle'), { kind: 'FACTS', values: {} })));
check(() => assert.throws(() => parseAssessmentResponse(item('meals-first-facts'), { kind: 'FACTS', values: { planned: true } })));
check(() => assert.equal(AssessmentAnswerInputSchema.safeParse({ presentationId: 'p', expectedRevision: 0, idempotencyKey: 'repeat-0001', response: { kind: 'MISSING', reason: 'SKIPPED' }, subjectId: 'spoof' }).success, false));
for (const reason of ['SKIPPED', 'NO_EXPERIENCE', 'NO_OPPORTUNITY', 'UNCLEAR'] as const) check(() => {
  const result = snapshot([record('meals-first-opportunity', { kind: 'MISSING', reason })]);
  assert.equal(result.participation.find(value => value.itemId === 'meals-first-opportunity')?.state, reason);
  assert.equal(result.skills.find(value => value.skillId === 'DOM.S07')?.A.exactLevel, null);
  assert.equal(result.skills.find(value => value.skillId === 'DOM.S07')?.CMinus.occurrenceState, 'UNKNOWN');
});
check(() => assert.ok(snapshot([]).skills.every(skill => skill.status === 'UNKNOWN' && skill.A.exactLevel === null)));
check(() => assert.equal(getAssessmentSkillAvailability('DOM.S01')?.reason, 'UNAVAILABLE_RUBRIC'));
check(() => assert.equal(getAssessmentSkillAvailability('DOM.S07')?.availableRubric, true));
check(() => assert.equal(getAssessmentSkillAvailability('absent'), null));
check(() => {
  const result = household(episodeAnswers());
  assert.equal(result.A.exactLevel, 3); assert.equal(result.A.observationCount, 4);
  assert.equal(result.A.result.quantitativeConfidence, null); assert.equal(result.K.exactLevel, null);
});
check(() => {
  const answers = episodeAnswers();
  assert.equal(household([...answers, ...answers]).A.observationCount, 4);
});
check(() => {
  // No single episode supports the complete L1 criterion. Cross-root joining
  // taskNoticed from one and agreedPartOrganised from another must not invent it.
  const answers = episodeAnswers().map((answer, index) => answer.response.kind !== 'FACTS' ? answer : {
    ...answer, response: { kind: 'FACTS' as const, values: { ...answer.response.values, taskNoticed: index < 4, agreedPartOrganised: index >= 4 } },
  });
  const result = household(answers).A;
  assert.equal(result.exactLevel, 0); assert.equal(result.result.criteria[0].evidence.yes, 0);
});
check(() => {
  const answers = episodeAnswers();
  const changed = answers.find(answer => answer.itemId === 'meals-first-facts')!;
  assert.throws(() => household([...answers, { ...changed, response: { kind: 'MISSING', reason: 'SKIPPED' } }]));
});
check(() => {
  const answers = episodeAnswers();
  const changed = answers.find(answer => answer.itemId === 'meals-first-opportunity')!;
  const result = household([...answers, { ...changed, revision: 2, response: { kind: 'MISSING', reason: 'NO_EXPERIENCE' } }]);
  assert.equal(result.A.observationCount, 3); assert.equal(result.A.exactLevel, null);
});
check(() => {
  const result = household(episodeAnswers(true));
  assert.equal(result.A.exactLevel, 3); assert.equal(result.CMinus.evidence.signedRate, -1);
  assert.equal(result.NMinus[0].evidence.signedRate, -1); assert.equal(result.NMinus[1].evidence.signedRate, -1);
  assert.ok(result.NMinus.every(pattern => pattern.canOffsetByPositiveSkills === false));
});
for (const patternId of ['NEG.AGR.01', 'NEG.DOM.01', 'NEG.DOM.03']) check(() => {
  const answers = episodeAnswers(true);
  const response = answers.find(answer => answer.itemId === 'meals-first-facts')!.response;
  assert.equal(response.kind, 'FACTS');
  if (response.kind !== 'FACTS') throw new Error('FACTS_FIXTURE_REQUIRED');
  assert.throws(() => parseAssessmentResponse(item('meals-first-facts'), {
    kind: 'FACTS', values: { ...response.values, [`${patternId}.eligible`]: false },
  }), /ASSESSMENT_OPPORTUNITY_CONTRADICTION/);
});
check(() => {
  const answers = episodeAnswers(true).map(answer => answer.response.kind !== 'FACTS' ? answer : {
    ...answer, response: { kind: 'FACTS' as const, values: { ...answer.response.values, 'NEG.DOM.03.eligible': null } },
  });
  const harm = household(answers).NMinus[1];
  assert.equal(harm.evidence.signedRate, null); assert.equal(harm.evidence.occurrenceRoots.length, 4);
});
check(() => {
  const answers = episodeAnswers().map(answer => ({ ...answer, phase: 'ASSISTED' as const }));
  const result = household(answers);
  assert.equal(result.A.phase, 'ASSISTED'); assert.equal(result.A.phases.find(value => value.phase === 'BASELINE')?.observationCount, 0);
});
check(() => {
  const answers = episodeAnswers().map(answer => answer.response.kind === 'FACTS' ? { ...answer, phase: 'ASSISTED' as const } : answer);
  const result = household(answers).A;
  assert.equal(result.phases.find(value => value.phase === 'ASSISTED')?.result.exactLevel, 3);
  assert.equal(result.phases.find(value => value.phase === 'BASELINE')?.result.exactLevel, null);
  assert.equal(result.exactLevel, null);
});
check(() => {
  const partial = household([record('task-change', { kind: 'OPTION', optionId: 'adapt-and-check' })]);
  assert.equal(partial.D.status, 'PARTIAL'); assert.equal(partial.D.exactLevel, null);
  assert.equal(partial.A.status, 'UNKNOWN');
});
check(() => {
  const answers = episodeAnswers();
  const publication = { ...DOM_S07_PUBLICATION, title: 'Другая локализация', items: DOM_S07_PUBLICATION.items.map(value => ({ ...value, title: 'Другая подпись', options: [...value.options].reverse() })) };
  const result = computeAssessmentProfile({ ...input, answers, publication });
  assert.deepEqual(result.skills, snapshot(answers).skills);
});
check(() => assert.throws(() => computeAssessmentProfile({ ...input, answers: [], period: { ...period, endsAt: period.startsAt } })));
process.stdout.write(`${JSON.stringify({ suite: 'assessment-content', status: 'passed', checks, acceptance: ['INT-003', 'INT-004', 'INT-005', 'INT-006', 'INT-008', 'INT-009', 'INT-010', 'INT-011', 'INT-012'] })}\n`);
