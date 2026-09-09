import { z } from 'zod';
import { parseExpr, type Facts } from './engine/core';
import { HOUSEHOLD_RUBRIC } from './engine/rubrics';
import {
  AssessmentResponseSchema, type AssessmentAnswerRecord, type AssessmentField,
  type AssessmentItem, type AssessmentPublication, type AssessmentResponse,
} from './contracts';

const positiveFields: AssessmentField[] = [
  ['taskNoticed', 'Я сам заметил конкретную бытовую задачу.'],
  ['agreedPartOrganised', 'Я организовал выполнение своего согласованного участка.'],
  ['planned', 'Я сам определил порядок действий и необходимые средства.'],
  ['completionOrganised', 'Я организовал выполнение задачи до согласованного результата.'],
  ['resultChecked', 'Я проверил, что согласованный результат достигнут.'],
  ['planningNotSilentlyOffloaded', 'Планирование не было незаметно переложено на другого человека.'],
  ['changeAnticipated', 'Я заранее заметил изменение условий, которое могло помешать задаче.'],
  ['resourcePlanAdapted', 'Я изменил план с учётом доступного времени, сил и средств.'],
  ['helpAgreedIfNeeded', 'При необходимости помощь была согласована; если помощь не требовалась, план это учитывал.'],
].map(([id, label]) => ({ id, label, factKey: `DOM.S07:${id}`, group: 'Что произошло в этом эпизоде' }));

const negativeGroups = [
  {
    id: 'NEG.AGR.01', group: 'Отдельно: действующая бытовая договорённость',
    fields: [
      ['eligible', 'В этом эпизоде была возможность выполнить конкретную бытовую договорённость.'],
      ['voluntaryValidAgreement', 'Была конкретная добровольная действующая договорённость; она не требовала отказа от безопасности, приватности или права на согласие.'],
      ['dueOpportunity', 'Наступил согласованный срок или подходящая возможность выполнения.'],
      ['notCompleted', 'Согласованное действие не было выполнено.'],
      ['noTimelyReleaseOrRevision', 'До срока не было отмены, допустимого освобождения или согласованного пересмотра договорённости.'],
    ],
  },
  {
    id: 'NEG.DOM.01', group: 'Отдельно: перенос ответственности',
    fields: [
      ['eligible', 'Эпизод относился к бытовой ответственности, которую я принял.'],
      ['acceptedTask', 'Я добровольно принял эту конкретную область быта.'],
      ['taskShiftedToOther', 'Планирование или выполнение фактически перешло к другому человеку.'],
      ['noConsentToTransfer', 'Другой человек не согласился на эту передачу.'],
      ['safeFeasibleCoordination', 'Обсудить перенос или пересмотр задачи было безопасно и доступно.'],
      ['coordinationOmitted', 'При этой возможности я не сообщил и не согласовал перенос.'],
    ],
  },
  {
    id: 'NEG.DOM.03', group: 'Отдельно: обращение с готовым результатом',
    fields: [
      ['eligible', 'В эпизоде я имел дело с уже готовым результатом бытовой работы.'],
      ['completedWorkKnown', 'Я знал, какой результат другой человек уже получил.'],
      ['resultDestroyed', 'Я уничтожил этот результат или намеренно сделал его непригодным.'],
      ['intentExplicitlyReported', 'Я прямо подтверждаю, что намеревался испортить результат.'],
      ['notAccidentOrAgreement', 'Это не было случайностью, согласованным изменением или необходимым безопасным действием.'],
    ],
  },
];
export const DOM_S07_NEGATIVE_FIELDS = negativeGroups.flatMap(group => group.fields.map(([id, label]) => ({
  id: `${group.id}.${id}`, label, factKey: `${group.id}:${id}`, group: group.group,
})));

const authoredFacts = (value: 'T' | 'F'): Facts => Object.fromEntries(
  HOUSEHOLD_RUBRIC.cumulativeFacts[2].map(key => [key, value]),
);
const scenes: AssessmentItem[] = [
  {
    id: 'knowledge-cycle', title: 'Что включает полная бытовая ответственность?',
    instructions: 'Саша добровольно взял на себя продукты на неделю. Какой вариант описывает полный цикл ответственности? Это учебная задача, не рассказ о вашем поведении.',
    method: 'KNOWLEDGE', track: 'K', familyId: 'assigned-planning', rootSlot: 'knowledge-cycle', kind: 'OPTION', fields: [],
    options: [
      { id: 'full-cycle', label: 'Заметить потребность, спланировать покупки, организовать выполнение, проверить результат; заранее обсудить изменения и нужную помощь.', facts: authoredFacts('T') },
      { id: 'execution-only', label: 'Купить то, что другой человек уже перечислил, оставив ему планирование и проверку.', facts: { 'DOM.S07:taskNoticed': 'F', 'DOM.S07:agreedPartOrganised': 'T' } },
    ],
  },
  {
    id: 'task-change', title: 'Учебная ситуация: изменились условия стирки',
    instructions: 'Вы договорились подготовить чистую рабочую одежду к понедельнику. В пятницу стиральная машина сломалась; рядом есть доступная прачечная. Выберите действие в этой вымышленной ситуации.',
    method: 'TASK', track: 'D', familyId: 'assigned-disruption', rootSlot: 'task-change', kind: 'OPTION', fields: [],
    options: [
      { id: 'adapt-and-check', label: 'Проверить сроки и средства, изменить план, согласовать нужную помощь и проверить готовность одежды к сроку.', facts: authoredFacts('T') },
      { id: 'silently-transfer', label: 'Ничего не согласовывать и ждать, пока другой человек сам заметит проблему и организует всё.', facts: authoredFacts('F') },
    ],
  },
];
const episodeSlots = [
  { id: 'meals-first', familyId: 'meals', title: 'Первый отдельный эпизод организации питания', instructions: 'Вспомните самый ранний конкретный эпизод за указанный период: продукты или приготовление еды, за которые вы взяли ответственность.' },
  { id: 'meals-latest', familyId: 'meals', title: 'Другой, более поздний эпизод организации питания', instructions: 'Используйте последний отдельный эпизод питания за период. Он должен отличаться от первого. Если второго эпизода не было, выберите «Нет опыта».' },
  { id: 'laundry-first', familyId: 'laundry', title: 'Первый отдельный эпизод ухода за одеждой', instructions: 'Вспомните самый ранний конкретный эпизод стирки или ухода за одеждой за указанный период, за который вы взяли ответственность.' },
  { id: 'laundry-latest', familyId: 'laundry', title: 'Другой, более поздний эпизод ухода за одеждой', instructions: 'Используйте последний отдельный эпизод ухода за одеждой за период. Это должен быть другой случай. Если его нет, выберите «Нет опыта».' },
];
const episodeItems: AssessmentItem[] = episodeSlots.flatMap(slot => {
  const common = { method: 'SELF_REPORT' as const, track: 'A' as const, familyId: slot.familyId, rootSlot: slot.id };
  return [
    {
      ...common, id: `${slot.id}-opportunity`, title: slot.title, instructions: slot.instructions,
      kind: 'OPTION' as const, fields: [], options: [{ id: 'HAS_EPISODE', label: 'Есть такой отдельный эпизод; я могу описать его', facts: { 'DOM.S07:eligible': 'T' as const } }],
    },
    {
      ...common, id: `${slot.id}-facts`, title: `${slot.title}: что произошло`,
      instructions: 'Отвечайте только об одном выбранном эпизоде. «Не знаю / не помню» сохраняет неизвестность. Самоотчёт не становится наблюдением другого человека. Отрицательные проявления учитываются отдельно и не вычитаются из уровня.',
      kind: 'FACTS' as const, options: [], fields: [...positiveFields, ...DOM_S07_NEGATIVE_FIELDS],
      dependsOn: { itemId: `${slot.id}-opportunity`, optionId: 'HAS_EPISODE' },
    },
  ];
});

export const DOM_S07_PUBLICATION: AssessmentPublication = {
  id: 'dom-s07-household-pilot', version: '1.0.0-draft', skillId: 'DOM.S07',
  title: 'Полный цикл бытовой ответственности', status: 'DRAFT', policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED',
  rubricVersion: HOUSEHOLD_RUBRIC.version, contextKey: 'household-responsibility-28d-v1',
  // Concrete recollections precede explanatory examples. Presenting the task or
  // knowledge options exposes the rubric: later corrections keep that exposure.
  items: [...episodeItems, { ...scenes[1], exposureFor: [...episodeItems.map(item => item.id), scenes[0].id] }, { ...scenes[0], exposureFor: [...episodeItems.map(item => item.id), scenes[1].id] }],
  terminalItemId: 'knowledge-cycle', maxItems: 10,
};

const truthSchema = z.enum(['T', 'F', 'U']);
const fieldSchema = z.object({ id: z.string().min(1).max(120), label: z.string().min(1).max(1200), factKey: z.string().min(1).max(160), group: z.string().min(1).max(160) }).strict();
const itemSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(300), instructions: z.string().min(1).max(2000),
  method: z.enum(['KNOWLEDGE', 'TASK', 'SELF_REPORT']), track: z.enum(['K', 'D', 'A']),
  familyId: z.string().min(1).max(120), rootSlot: z.string().min(1).max(120), kind: z.enum(['OPTION', 'FACTS']),
  options: z.array(z.object({ id: z.string().min(1).max(120), label: z.string().min(1).max(1200), facts: z.record(truthSchema) }).strict()).max(20),
  fields: z.array(fieldSchema).max(40), dependsOn: z.object({ itemId: z.string(), optionId: z.string() }).strict().optional(),
  exposureFor: z.array(z.string()).max(10).optional(),
}).strict();
const publicationSchema = z.object({
  id: z.string().min(1).max(120), version: z.string().min(1).max(80), skillId: z.literal('DOM.S07'),
  title: z.string().min(1).max(300), status: z.literal('DRAFT'), policyStatus: z.literal('AUTHOR_POLICY_NOT_CALIBRATED'),
  rubricVersion: z.string().min(1).max(80), contextKey: z.string().min(1).max(160),
  items: z.array(itemSchema).min(1).max(40), terminalItemId: z.string(), maxItems: z.number().int().min(1).max(40),
}).strict();
const knownFacts = new Set(['DOM.S07:eligible', ...HOUSEHOLD_RUBRIC.cumulativeFacts[2], ...DOM_S07_NEGATIVE_FIELDS.map(field => field.factKey)]);

/** Unknown is confined to this external publication boundary and validated before use. */
export function validateAssessmentPublication(input: unknown): AssessmentPublication {
  const result = publicationSchema.safeParse(input);
  if (!result.success) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
  const publication = result.data;
  const seen = new Set<string>();
  const rootFamilies = new Map<string, string>();
  if (publication.items.length > publication.maxItems || publication.rubricVersion !== HOUSEHOLD_RUBRIC.version) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
  for (const item of publication.items) {
    const rootIdentity = `${item.method}:${item.rootSlot}`;
    if (rootFamilies.has(rootIdentity) && rootFamilies.get(rootIdentity) !== item.familyId) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    rootFamilies.set(rootIdentity, item.familyId);
    if (seen.has(item.id) || ({ K: 'KNOWLEDGE', D: 'TASK', A: 'SELF_REPORT' })[item.track] !== item.method) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    if (item.kind === 'OPTION' ? item.options.length === 0 || item.fields.length > 0 : item.fields.length === 0 || item.options.length > 0) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    if (new Set(item.options.map(option => option.id)).size !== item.options.length || new Set(item.fields.map(field => field.id)).size !== item.fields.length || new Set(item.fields.map(field => field.factKey)).size !== item.fields.length) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    const keys = [...item.fields.map(field => field.factKey), ...item.options.flatMap(option => Object.keys(option.facts))];
    if (keys.some(key => !knownFacts.has(key))) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    for (const option of item.options) parseExpr({ op: 'ALL', args: Object.keys(option.facts).map(key => ({ op: 'FACT', key })) });
    if (item.dependsOn) {
      const parent = publication.items.find(candidate => candidate.id === item.dependsOn?.itemId);
      if (!seen.has(item.dependsOn.itemId) || !parent?.options.some(option => option.id === item.dependsOn?.optionId) || parent.rootSlot !== item.rootSlot || parent.familyId !== item.familyId) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    }
    if (item.exposureFor?.some(id => !publication.items.some(candidate => candidate.id === id))) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
    seen.add(item.id);
  }
  if (!seen.has(publication.terminalItemId) || publication.items.at(-1)?.id !== publication.terminalItemId) throw new Error('ASSESSMENT_INVALID_PUBLICATION');
  return publication;
}

/** Validate transport at the item boundary; never return Zod values or answers in errors. */
export function parseAssessmentResponse(item: AssessmentItem, input: unknown): AssessmentResponse {
  const result = AssessmentResponseSchema.safeParse(input);
  if (!result.success) throw new Error('ASSESSMENT_INVALID_RESPONSE');
  const response = result.data;
  if (response.kind === 'MISSING') return response;
  if (response.kind === 'OPTION') {
    if (item.kind !== 'OPTION' || !item.options.some(option => option.id === response.optionId)) throw new Error('ASSESSMENT_INVALID_RESPONSE');
  } else {
    if (item.kind !== 'FACTS' || Object.keys(response.values).length !== item.fields.length || item.fields.some(field => !Object.hasOwn(response.values, field.id))) throw new Error('ASSESSMENT_INVALID_RESPONSE');
    // An explicitly described occurrence cannot simultaneously have no eligible
    // opportunity. Reject before a source can become permanently PENDING.
    // Unknown eligibility is permitted: occurrence without a denominator is valid.
    for (const group of negativeGroups) {
      if (response.values[`${group.id}.eligible`] === false && group.fields.filter(([id]) => id !== 'eligible').every(([id]) => response.values[`${group.id}.${id}`] === true)) throw new Error('ASSESSMENT_OPPORTUNITY_CONTRADICTION');
    }
  }
  return response;
}
export function isAssessmentItemAvailable(item: AssessmentItem, answers: readonly AssessmentAnswerRecord[]): boolean {
  if (!item.dependsOn) return true;
  const parent = answers.find(answer => answer.itemId === item.dependsOn?.itemId);
  return parent?.response.kind === 'OPTION' && parent.response.optionId === item.dependsOn.optionId;
}
export function assessmentResponseFacts(item: AssessmentItem, input: AssessmentResponse): Facts {
  const response = parseAssessmentResponse(item, input);
  if (response.kind === 'MISSING') return {};
  if (response.kind === 'OPTION') return item.options.find(option => option.id === response.optionId)!.facts;
  return Object.fromEntries(item.fields.map(field => [field.factKey, response.values[field.id] === true ? 'T' : response.values[field.id] === false ? 'F' : 'U']));
}
validateAssessmentPublication(DOM_S07_PUBLICATION);
