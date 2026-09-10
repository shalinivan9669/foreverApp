import scenes from './content.scenes.json';
import { RUBRICS } from './engine/rubrics';
import type { Facts, Truth } from './engine/core';
import type { AssessmentField, AssessmentItem, AssessmentOption, AssessmentPublication, AssessmentSkillId, AssessmentSlot } from './contracts';

const names: Record<AssessmentSkillId, string> = {
  'DOM.S07': 'Полный цикл бытовой ответственности', 'COM.S02': 'Конкретная просьба', 'COM.S04': 'Пауза и возвращение к разговору',
};
const labels: Record<AssessmentSkillId, string[]> = {
  'DOM.S07': ['Я сам заметил задачу.', 'Я организовал свой добровольно согласованный участок.', 'Я составил план.', 'Я организовал выполнение до результата.', 'Я проверил результат.', 'Планирование осталось у меня, без незаметной передачи другому.', 'Я заранее учёл изменение условий.', 'Я изменил план под доступный ресурс.', 'Нужная помощь была подтверждена; если она не требовалась, план обходился без неё.'],
  'COM.S02': ['Я назвал конкретное желаемое действие.', 'Я обозначил относящийся к просьбе контекст или время.', 'Просьба была выполнима в известных условиях.', 'Другой мог отказаться или предложить вариант без наказания.', 'Я учёл прямо сообщённые интересы и ограничения обоих.', 'Была доступна выполнимая альтернатива.', 'Альтернатива сохраняла суть моей просьбы.'],
  'COM.S04': ['Я сообщил о паузе понятным способом.', 'Пауза не сопровождалась угрозой или принуждением.', 'Оба явно согласовали способ возвращения.', 'Оба явно согласовали время или проверяемое условие возвращения.', 'Я выделил конкретные условия перегрузки из описанных случаев.', 'Процесс разговора был изменён с учётом этих условий и приемлемости для обоих.'],
};
const keys = (skillId: AssessmentSkillId) => RUBRICS.find(rubric => rubric.skillId === skillId)!.cumulativeFacts[2];
const factMap = (factKeys: readonly string[], truth: Truth): Facts => Object.fromEntries(factKeys.map(key => [key, truth]));
const option = (id: string, label: string, factKeys: readonly string[], truth: Truth): AssessmentOption => ({ id, label, facts: factMap(factKeys, truth) });

/** Alternatives are authored semantic actions. No text, length, position or note scoring. */
function slot(id: string, label: string, factKeys: readonly string[], supported: string, conflict: string, alternative?: string): AssessmentSlot {
  return { id, label, options: [option('plan', supported, factKeys, 'T'), ...(alternative ? [option('accessible', alternative, factKeys, 'T')] : []), option('other', conflict, factKeys, 'F'), option('uncertain', 'Этого пока нельзя установить из моего плана.', factKeys, 'U')] };
}
function householdSlots(): AssessmentSlot[] {
  const k = keys('DOM.S07');
  return [
    slot('notice', 'Начало цикла', [k[0]], 'Сверить данные о текущем состоянии и записать потребность в выбранной зоне.', 'Начинать только после напоминания другого.', 'Проверить состояние с доступным напоминанием в личном календаре.'),
    slot('scope', 'Принятый участок', [k[1]], 'Взять указанный в задании участок и его проверяемый результат.', 'Считать, что весь участок уже организует второй.'),
    slot('plan', 'Порядок и ресурс', [k[2]], 'Сначала проверить данные и средства, затем подготовить, выполнить и проверить; уложиться в заданный лимит.', 'Начать выполнение без проверки средств и времени.'),
    slot('execution', 'Исполнение', [k[3]], 'Выполнить доступным личным способом в указанном ресурсе.', 'Назначить помощника, который ещё не подтвердил участие.', 'Использовать уже согласованный внешний способ в том же лимите и сохранить контроль результата.'),
    slot('check', 'Завершение', [k[4], k[5]], 'Самостоятельно сверить три признака результата: нужное состояние, нужное место, готовность к согласованному сроку.', 'Считать задачу завершённой после начала; проверку и напоминания оставить второму.'),
    slot('change', 'Новое условие', [k[6], k[7], k[8]], 'До срока проверить изменившийся ресурс, выбрать допустимую замену; если её нет, предложить пересмотр и дождаться подтверждения помощи.', 'Сохранить недоступный способ или молча увеличить чужую нагрузку.'),
  ];
}
function requestSlots(index: number): AssessmentSlot[] {
  const k = keys('COM.S02');
  const actions = ['перенести видеозвонок', 'выделить часть тихого часа в общей зоне', 'прислать три сведения коротким списком', 'сократить один этап встречи'];
  const windows = ['завтра после 18:00', 'в доступную второму часть часа; остаток работы сделать другим способом', 'позже в согласованный срок', 'по оставшемуся доступному варианту'];
  return [
    slot('action', 'Содержание просьбы', [k[0]], `Можно ${actions[index]}?`, 'Если бы тебе было важно, ты бы догадался.'),
    slot('context', 'Контекст и время', [k[1]], `Предлагаю ${windows[index]}; мне это нужно для названной в задаче цели.`, 'Как-нибудь потом, но именно так, как мне нужно.'),
    slot('feasible', 'Проверка выполнимости', [k[2]], 'Использовать доступные в задании ограничения; неизвестную доступность сначала уточнить.', 'Потребовать недоступный сегодня срок, потому что так удобнее мне.'),
    slot('choice', 'Выбор другого', [k[3]], 'Можно отказаться или предложить другой вариант; отказ не создаёт долга.', 'Согласие обязательно, иначе общение прекращается в наказание.'),
    slot('interests', 'Новое сообщение', [k[4]], 'Учесть сообщённый предел второго и свою цель; не приписывать ему мотивы.', 'Не менять запрос после прямо сообщённого ограничения.'),
    { id: 'alternative', label: 'Обновлённый вариант', options: [
      option('plan', `Предложить ${windows[index]}, сохранив ${actions[index]}; считать это предложением до ответа.`, [k[5], k[6]], 'T'),
      { id: 'stop', label: 'Общего варианта пока не найдено: закончить обсуждение, сохранив право вернуться к своей просьбе.', facts: { [k[5]]: 'U', [k[6]]: 'T' } },
      option('other', 'Требовать исходный недоступный вариант; другую цель считать заменой согласия.', [k[5], k[6]], 'F'),
      option('uncertain', 'Выполнимость альтернативы пока неизвестна.', [k[5], k[6]], 'U'),
    ] },
  ];
}
function pauseSlots(index: number): AssessmentSlot[] {
  const k = keys('COM.S04');
  const agreementKnown = index >= 2;
  const agreement = (id: string, label: string, key: string, text: string): AssessmentSlot => ({ id, label, options: [
    option('plan', text, [key], agreementKnown ? 'T' : 'U'),
    option('other', 'Считать своё предложение подтверждённым за обоих, хотя второго ответа нет.', [key], 'F'),
    option('uncertain', 'Подтверждение пока не получено; сохраняю предложение отдельно.', [key], 'U'),
  ] });
  return [
    slot('pause', 'Сообщение о паузе', [k[0]], 'Мне нужна пауза. Я сейчас остановлюсь.', 'Исчезнуть, хотя в безопасной сцене доступно короткое сообщение.', 'Использовать заранее доступную короткую текстовую фразу вместо голоса.'),
    slot('choice', 'Добровольность', [k[1]], 'Никто не обязан продолжать сейчас; возвращение не условие подчинения.', 'Я вернусь только когда ты признаешь, что неправ.'),
    agreement('method', 'Способ возвращения', k[2], agreementKnown ? 'Использовать явно подтверждённый обоими короткий текстовый список, затем добровольный разговор.' : 'Предложить текстовое уточнение; второй ещё не подтвердил его.'),
    agreement('time', 'Время или условие', k[3], agreementKnown ? 'Оба подтвердили: завтра в 18:00 проверить готовность, а при неудобстве заново согласовать.' : 'Предложить завтра проверить готовность; считать время ещё не согласованным.'),
    { id: 'pattern', label: 'Условия перегрузки', options: [option('plan', index === 2 ? 'В трёх данных эпизодах повторились позднее время и длинная повестка.' : 'Повторяющийся рисунок в этой сцене не установлен; не приписываю диагноз.', [k[4]], index === 2 ? 'T' : 'U'), option('other', 'Причина в том, что второй всегда безразличен.', [k[4]], 'F'), option('uncertain', 'Недостаточно сведений об условиях.', [k[4]], 'U')] },
    slot('adapt', 'Изменение процесса', [k[5]], 'Предложить короткое добровольное окно, одну тему и проверку приемлемости; остановиться при небезопасности.', 'Требовать немедленно закончить всё обсуждение, несмотря на перегрузку.'),
  ];
}

function authoredScene(raw: typeof scenes[number], skillId: AssessmentSkillId, index: number): AssessmentItem {
  const task = raw.track === 'TASK';
  const slots = skillId === 'DOM.S07' ? householdSlots() : skillId === 'COM.S02' ? requestSlots(index) : pauseSlots(index);
  const allFacts = Object.assign({}, ...slots.map(value => value.options[0].facts)) as Facts;
  const alternativeFacts = skillId === 'COM.S02' ? { ...allFacts, 'COM.S02:alternativeFeasible': 'U' as const } : allFacts;
  const assistance = skillId === 'COM.S04' && index >= 2 ? ' Отдельный ответ вымышленного второго участника: «Согласен на короткий список текстом и завтра в 18:00 проверить готовность; любой может предложить пересмотр». Это только данные задания.' : '';
  return {
    id: raw.id.toLowerCase(), title: raw.title, instructions: `${raw.stimulus}${assistance} ${task ? 'Соберите свой план из отдельных блоков. Оценивается только выполнение задания.' : 'Выберите полный план. Оценивается только распознавание в задании.'}`,
    changedInstructions: raw.changedStimulus, method: task ? 'TASK' : 'KNOWLEDGE', track: task ? 'D' : 'K', familyId: raw.familySemanticKey,
    rootSlot: raw.id, kind: task ? 'STRUCTURED' : 'OPTION', fields: [], ...(task ? { slots } : {}),
    options: task ? [] : [
      { id: 'considered-plan', label: slots.map(value => value.options[0].label).join(' '), facts: allFacts },
      { id: 'accessible-plan', label: skillId === 'DOM.S07' ? 'Проверить потребность с личным календарём; организовать согласованный участок доступным внешним способом в том же ресурсе; самому спланировать и проверить результат; заранее согласовать изменения и помощь.' : skillId === 'COM.S02' ? 'Сформулировать конкретную просьбу и контекст; учесть известные пределы, оставить право отказа; если общего варианта ещё нет, сохранить цель и закончить обсуждение без давления.' : 'Письменно сообщить о паузе без угрозы. Предложить доступный короткий формат и время, отличая предложение от подтверждения; учитывать только известные условия и право остановиться.', facts: alternativeFacts },
      { id: 'unilateral-plan', label: slots.filter((_, slotIndex) => slotIndex !== 0).map(value => value.options.find(candidate => candidate.id === 'other')!.label).join(' '), facts: { ...allFacts, ...factMap(keys(skillId).slice(1), 'F') } },
      { id: 'insufficient-plan', label: 'Обозначить только первый шаг; остальные условия оставить неуточнёнными.', facts: { ...factMap(keys(skillId), 'U'), [keys(skillId)[0]]: 'T' } },
    ],
  };
}
const agreementFields: AssessmentField[] = [
  ['eligible', 'Была подходящая возможность по конкретной договорённости.'], ['voluntaryValidAgreement', 'Я добровольно принял действующую договорённость, не требующую отказа от безопасности, контакта или приватности.'], ['dueOpportunity', 'Наступил срок или возможность выполнения.'], ['notCompleted', 'Действие не было выполнено.'], ['noTimelyReleaseOrRevision', 'До срока не было допустимой отмены или своевременного пересмотра.'],
].map(([id, label]) => ({ id: `NEG.AGR.01.${id}`, factKey: `NEG.AGR.01:${id}`, label, group: 'Необязательно: отдельное описание договорённости; можно ответить «Не знаю»' }));
const transferFields: AssessmentField[] = [
  ['eligible', 'Была возможность в принятой бытовой области.'], ['acceptedTask', 'Я добровольно принял этот участок.'], ['taskShiftedToOther', 'Планирование или выполнение перешло к другому.'], ['noConsentToTransfer', 'Другой не соглашался принять эту передачу.'], ['safeFeasibleCoordination', 'Сообщить или согласовать пересмотр было безопасно и доступно.'], ['coordinationOmitted', 'Я не сообщил и не согласовал передачу при такой возможности.'],
].map(([id, label]) => ({ id: `NEG.DOM.01.${id}`, factKey: `NEG.DOM.01:${id}`, label, group: 'Необязательно: передача ответственности' }));
function applicationItems(skillId: AssessmentSkillId): AssessmentItem[] {
  const families = skillId === 'DOM.S07' ? ['meals', 'laundry'] : skillId === 'COM.S02' ? ['time-request', 'resource-request'] : ['live-discussion', 'text-discussion'];
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${skillId.toLowerCase()}-episode-${index + 1}`, title: `${index % 2 === 0 ? 'Первый' : 'Другой'} отдельный эпизод: ${skillId === 'DOM.S07' ? index < 2 ? 'питание' : 'уход за вещами' : skillId === 'COM.S02' ? index < 2 ? 'просьба о времени' : 'просьба о ресурсе' : index < 2 ? 'устный разговор' : 'переписка'}`,
    instructions: 'Опишите один собственный эпизод в выбранном завершённом периоде. Укажите дату события; запись сегодня не делает событие новым. «Да» означает, что именно это произошло, «Нет» — известно, что не произошло, «Не знаю» — не помните или условие не установлено. Если опыта не было, завершите без придуманного ответа. Не указывайте имена и переписку. Это выборочные описанные случаи, не частота всей жизни.',
    method: 'SELF_REPORT', track: 'A', familyId: families[Math.floor(index / 2)], rootSlot: `episode-${index + 1}`, kind: 'FACTS', options: [],
    fields: [
      { id: 'eligible', factKey: `${skillId}:eligible`, label: 'В этот день была подходящая возможность выполнить выбранное действие.', group: 'Применимость эпизода' },
      ...keys(skillId).map((factKey, factIndex) => ({ id: factKey.split(':')[1], factKey, label: labels[skillId][factIndex], group: 'Что произошло с моим участием' })),
      ...agreementFields, ...(skillId === 'DOM.S07' ? transferFields : []),
    ],
  }));
}
export const BETA_PUBLICATIONS: AssessmentPublication[] = (Object.keys(names) as AssessmentSkillId[]).flatMap(skillId => (['KNOWLEDGE', 'TASK', 'SELF_REPORT'] as const).map(method => {
  const suffix = method === 'SELF_REPORT' ? 'application' : method.toLowerCase();
  const authored = method === 'SELF_REPORT' ? applicationItems(skillId) : scenes.filter(scene => scene.skillId === skillId && scene.track === method).map((scene, index) => authoredScene(scene, skillId, index));
  const items = method === 'TASK' ? authored.flatMap(item => [
    { ...item, slots: item.slots!.slice(0, 4), changedInstructions: undefined },
    { ...item, id: `${item.id}-changed`, title: `${item.title}: изменились условия`, instructions: item.changedInstructions!, changedInstructions: undefined, slots: item.slots!.slice(4), dependsOn: { itemId: item.id } },
  ]) : authored;
  return {
    id: `${skillId.toLowerCase().replace('.', '-')}-${suffix}-beta`, version: '1.0.0-author-beta', skillId,
    title: `${names[skillId]} — ${method === 'SELF_REPORT' ? 'описанное применение' : method === 'TASK' ? 'сборка плана' : 'понимание'}`,
    status: 'DRAFT', policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED', rubricVersion: '0.2.0-demo', contextKey: `${skillId}:individual-author-beta-v1`,
    items, terminalItemId: items.at(-1)!.id, maxItems: items.length,
    metadata: { responseSchemaVersion: 'assessment-response-v2', interpretationVersion: 'author-beta-v1', usagePolicyVersion: 'beta-purpose-v1', contentReview: 'INTERNAL_AUTHOR_REVIEW',
      allowedPurposes: method === 'SELF_REPORT' ? ['OWNER', 'PAIR', 'MATCHING'] : ['OWNER'], compatibilityKey: `${skillId}:${method}:author-beta-v1`, samplingFrame: method === 'SELF_REPORT' ? 'SELECTED_DESCRIBED_EPISODES' : 'ASSIGNED_SCENES', freshnessDays: 90,
      explanation: 'Авторский ограниченный модуль. Учебный результат не доказывает применение в жизни; отсутствие данных не означает нулевой навык. Можно остановиться и управлять использованием данных.',
      authoredExplanation: skillId === 'DOM.S07' ? 'Полный цикл включает замеченную потребность, добровольно принятый участок, план, организацию исполнения и проверку. Изменение ресурса требует доступной адаптации и согласования помощи, без молчаливого назначения второго организатором.' : skillId === 'COM.S02' ? 'Конкретная просьба называет действие и контекст, учитывает выполнимость и оставляет право отказаться. Альтернатива должна учитывать интересы обоих и сохранять суть просьбы. Если общего варианта нет, его отсутствие остаётся неизвестным критерием, а не недостатком личности.' : 'Пауза обозначается понятным способом без угрозы и принуждения. Предложение способа и времени возвращения отличается от согласования обоими. Повторяющиеся условия нельзя угадывать; изменение процесса учитывает только известные обстоятельства. Небезопасный контакт можно прекратить.',
    },
  };
}));

/** Optional real supplementary form. It measures the same declared application
 * construct/frame as DOM beta A and offers fewer episodes without claiming that
 * two pages satisfy the four-episode author policy. Known episodes retain roots. */
const householdApplication = BETA_PUBLICATIONS.find(publication => publication.id === 'dom-s07-application-beta')!;
const clarificationItems: AssessmentItem[] = applicationItems('DOM.S07').filter((_, index) => index % 2 === 0).map(item => ({
  ...item, id: `dom.s07-clarification-${item.familyId}`, rootSlot: `clarification-${item.familyId}`,
  title: `${item.familyId === 'meals' ? 'Питание' : 'Уход за вещами'} — короткое дополнение`,
  instructions: `Необязательное дополнение по одному случаю. Если этот эпизод уже описан в основной бытовой форме того же периода, выберите его в списке: повтор не создаёт новое наблюдение. Для исправления самого прежнего ответа откройте исходную форму; несовпадающие описания остаются неизвестностью. Можно описать новый отдельный случай или пропустить страницу. ${item.instructions}`,
}));
export const BETA_APPLICATION_CLARIFICATION: AssessmentPublication = {
  ...householdApplication, id: 'dom-s07-application-clarification-beta',
  title: 'Бытовая ответственность — необязательное дополнение об эпизоде',
  items: clarificationItems, terminalItemId: clarificationItems.at(-1)!.id, maxItems: clarificationItems.length,
  metadata: { ...householdApplication.metadata!, explanation: 'Короткая добровольная форма для одного бытового случая в каждом из двух контекстов. Она совместима с основной бытовой формой применения только в том же завершённом периоде, индивидуальном контексте и фазе. Повтор выбранного эпизода не повышает достаточность. Двух страниц самих по себе недостаточно для четырёх эпизодов авторской рубрики.' },
};
