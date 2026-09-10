'use client';
import { useState } from 'react';
import type { AssessmentDirectAnswers } from '@/domain/assessment/comparison';
import type { AssessmentComparisonDTO, AssessmentComparisonMutation, AssessmentComparisonStatus, AssessmentDirectionalStatus } from '@/lib/dto/assessmentComparison.dto';
import { useAssessmentComparison } from '@/client/hooks/useAssessmentComparison';
import { confirmAppNavigation, useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import AssessmentPairPanel from './AssessmentPairPanel';

const statusLabels: Record<AssessmentComparisonStatus, string> = {
  TARGET_SUPPORTED: 'Все опубликованные условия поддержаны', FEASIBLE_WITH_DIFFERENCES: 'Есть допустимый план с различиями',
  NEEDS_CLARIFICATION: 'Сначала нужны уточнения', NO_TARGET_PLAN_IN_CATALOG: 'В опубликованном наборе подходящий план не найден', INCOMPLETE: 'Поиск не завершён в пределах бюджета',
};
const directionLabels: Record<AssessmentDirectionalStatus, string> = { SUPPORTED: 'поддержано', NOT_SUPPORTED: 'не поддержано', UNRESOLVED: 'неизвестно, нужны уточнения' };
const slotOptions = [
  { id: 'WEEKDAY_EVENING', label: 'Будний вечер' }, { id: 'WEEKEND_MORNING', label: 'Выходной утром' }, { id: 'WEEKEND_EVENING', label: 'Выходной вечером' },
] as const;
type ActionId = Extract<AssessmentComparisonMutation, { action: 'scenario' }>['actionIds'][number];
const actionId = (id: string): id is ActionId => ['A_demonstrates_full_cycle', 'B_demonstrates_full_cycle', 'joint_schedule'].includes(id);
type NumericField = 'capacityMinutes' | 'ordinaryTaskMinutes' | 'practiceBudgetMinutes' | 'scheduleBudgetMinutes';
const numericFields: Array<{ key: NumericField; label: string }> = [
  { key: 'capacityMinutes', label: 'Сколько минут всего вы добровольно можете выделить за весь период?' },
  { key: 'ordinaryTaskMinutes', label: 'Сколько минут за период займёт ваша обычная бытовая задача? Обязательное прямое значение.' },
  { key: 'practiceBudgetMinutes', label: 'Сколько минут за период вы готовы выделить на попытку нового способа действия?' },
  { key: 'scheduleBudgetMinutes', label: 'Сколько минут за период вы готовы выделить на согласование расписания?' },
];
const emptyAnswers: Omit<AssessmentDirectAnswers, 'ordinaryTaskMinutes'> = {
  parenthood: null, relationshipFormat: null, offersShopping: null, offersCooking: null,
  acceptableMeetingSlots: null, proposedMeetingSlots: null, capacityMinutes: null,
  practiceBudgetMinutes: null, scheduleBudgetMinutes: null, willingPractice: null, willingSchedule: null,
};
function DirectForm({ direct, role, busy, save }: { direct: AssessmentComparisonDTO['direct']; role?: 'A' | 'B'; busy: boolean; save: (answers: AssessmentDirectAnswers, permission: boolean) => Promise<boolean> }) {
  const [answers, setAnswers] = useState<Omit<AssessmentDirectAnswers, 'ordinaryTaskMinutes'>>(direct.answers ?? emptyAnswers);
  const [touched, setTouched] = useState<Partial<Record<keyof AssessmentDirectAnswers, boolean>>>(direct.answers ? { offersCooking: true, offersShopping: true, willingPractice: true, willingSchedule: true } : {});
  const [amounts, setAmounts] = useState<Record<NumericField, string>>(() => Object.fromEntries(numericFields.map(field => [field.key, direct.answers?.[field.key]?.toString() ?? ''])) as Record<NumericField, string>);
  const [permission, setPermission] = useState(direct.useForComparison);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, busy);
  const set = <K extends Exclude<keyof AssessmentDirectAnswers, 'ordinaryTaskMinutes'>>(key: K, value: AssessmentDirectAnswers[K]) => { setAnswers(previous => ({ ...previous, [key]: value })); setTouched(previous => ({ ...previous, [key]: true })); setDirty(true); };
  const amountsValid = amounts.ordinaryTaskMinutes.trim() !== '' && numericFields.every(field => amounts[field.key] === '' || /^\d+$/.test(amounts[field.key]) && Number(amounts[field.key]) <= 28 * 1440);
  const booleanFields: Array<{ key: 'offersShopping' | 'offersCooking' | 'willingPractice' | 'willingSchedule'; label: string }> = [
    { key: 'offersShopping', label: 'Я предлагаю взять полный цикл закупок продуктов.' },
    { key: 'offersCooking', label: 'Я предлагаю взять полный цикл приготовления еды.' },
    { key: 'willingPractice', label: 'Я добровольно открыт к попытке освоить другой способ выполнения бытовой задачи.' },
    { key: 'willingSchedule', label: 'Я добровольно открыт к совместному пересмотру расписания в пределах моих допустимых окон.' },
  ];
  return <form className="app-panel p-4 space-y-5" onSubmit={event => {
    event.preventDefault(); if (!amountsValid) return;
    const number = (key: NumericField) => amounts[key] === '' ? null : Number(amounts[key]);
    void save({ ...answers, capacityMinutes: number('capacityMinutes'), ordinaryTaskMinutes: Number(amounts.ordinaryTaskMinutes), practiceBudgetMinutes: number('practiceBudgetMinutes'), scheduleBudgetMinutes: number('scheduleBudgetMinutes') }, permission).then(ok => { if (ok) setDirty(false); });
  }}>
    <h3 className="font-semibold text-lg">Мои позиции, предложения и ресурс</h3>
    <p>Сравнение использует небольшой опубликованный план: участник A готовит, участник B организует закупки. {role ? `В этом контексте вы — участник ${role}.` : 'Роль определяет действующая пара на сервере.'} Это описание варианта, а не назначение обязанности.</p>
    <fieldset disabled={busy} className="space-y-3"><legend className="font-medium">Принципиальные позиции</legend>
      <label className="block space-y-1"><span>Родительство</span><select className="app-input block w-full" value={answers.parenthood ?? ''} onChange={event => set('parenthood', event.target.value === 'WANT_CHILDREN' ? 'WANT_CHILDREN' : event.target.value === 'DO_NOT_WANT_CHILDREN' ? 'DO_NOT_WANT_CHILDREN' : null)}><option value="">Не определено / пропустить</option><option value="WANT_CHILDREN">Хочу детей</option><option value="DO_NOT_WANT_CHILDREN">Не хочу детей</option></select></label>
      <label className="block space-y-1"><span>Формат отношений в этом сравнении</span><select className="app-input block w-full" value={answers.relationshipFormat ?? ''} onChange={event => set('relationshipFormat', event.target.value === 'EXCLUSIVE' ? 'EXCLUSIVE' : event.target.value === 'NON_EXCLUSIVE' ? 'NON_EXCLUSIVE' : null)}><option value="">Не определено / пропустить</option><option value="EXCLUSIVE">Эксклюзивный: романтические отношения только друг с другом</option><option value="NON_EXCLUSIVE">Неэксклюзивный: другие романтические отношения допустимы после согласования правил</option></select></label>
      <p className="app-muted text-sm">Эти позиции нельзя изменить сценарием развития навыка. Конкретные правила отношений требуют отдельного добровольного согласования.</p>
    </fieldset>
    {booleanFields.map(field => <fieldset key={field.key} disabled={busy}><legend>{field.label}</legend><div className="flex flex-wrap gap-4">{[{ value: true, label: 'Да' }, { value: false, label: 'Нет' }, { value: null, label: 'Решения пока нет' }].map(option => <label key={String(option.value)} className="min-h-11 flex gap-2 items-center"><input type="radio" name={field.key} checked={Boolean(touched[field.key]) && answers[field.key] === option.value} onChange={() => set(field.key, option.value)} />{option.label}</label>)}</div></fieldset>)}
    {(['acceptableMeetingSlots', 'proposedMeetingSlots'] as const).map(key => <fieldset key={key} disabled={busy} className="space-y-2"><legend className="font-medium">{key === 'acceptableMeetingSlots' ? 'Мои допустимые окна для совместных дел сейчас' : 'Какие окна я добровольно предлагаю для отдельного сценария'}</legend>{slotOptions.map(option => <label key={option.id} className="min-h-11 flex items-center gap-2"><input type="checkbox" checked={answers[key]?.includes(option.id) ?? false} onChange={event => set(key, event.target.checked ? [...(answers[key] ?? []), option.id] : (answers[key] ?? []).filter(value => value !== option.id))} />{option.label}</label>)}<button type="button" className="app-btn-secondary" onClick={() => set(key, null)}>Оставить неизвестным</button><button type="button" className="app-btn-secondary ml-2" onClick={() => set(key, [])}>Нет подходящих окон</button><p className="app-muted">{answers[key] === null ? 'Неизвестно; пустота не считается согласием.' : answers[key]?.length === 0 ? 'Вы явно указали отсутствие подходящих окон.' : 'Выбраны только отмеченные окна.'}</p></fieldset>)}
    <fieldset disabled={busy} className="space-y-3"><legend className="font-medium">Собственный ресурс за тот же период 28 дней</legend>{numericFields.map(field => <label className="block" key={field.key}><span>{field.label}</span><input className="app-input block w-full" inputMode="numeric" type="number" min={0} max={28 * 1440} step={1} required={field.key === 'ordinaryTaskMinutes'} value={amounts[field.key]} onChange={event => { setAmounts(previous => ({ ...previous, [field.key]: event.target.value })); setDirty(true); }} /><span className="app-muted text-sm">{field.key === 'ordinaryTaskMinutes' ? 'Явный ноль допустим только как ваш ответ.' : 'Пустое поле означает неизвестность.'}</span></label>)}<p className="app-muted">Обычная задача и попытка используют один общий бюджет времени. Время попытки не является обещанным сроком освоения навыка.</p></fieldset>
    <label className="min-h-11 flex items-start gap-3"><input disabled={busy} type="checkbox" checked={permission} onChange={event => { setPermission(event.target.checked); setDirty(true); }} /><span>Разрешаю использовать эти прямые ответы для ограниченного сравнения с участником моей действующей пары. Разрешение на измерительные ответы задаётся отдельно выше.</span></label>
    <p role="status">{busy ? 'Ждём подтверждения сервера…' : dirty ? 'Есть несохранённые изменения.' : direct.answers ? 'Показаны сохранённые собственные ответы.' : 'Ответы ещё не сохранены.'}</p><button className="app-btn-primary" disabled={busy || !amountsValid}>Сохранить мои позиции и предложения</button>
  </form>;
}

export default function AssessmentComparisonPanel({ ownerId }: { ownerId: string }) {
  const { data, busy, error, saved, mutate, reload } = useAssessmentComparison(ownerId);
  const [selected, setSelected] = useState<ActionId[]>([]);
  const available = data?.current?.availableActions.filter(action => actionId(action.id)) ?? [];
  return <section className="space-y-5" aria-label="Текущее и условное сравнение">
    <h2 className="text-xl font-semibold">Текущее сравнение и отдельные условные варианты</h2>
    <p className="app-muted">Сравнение двух изолированных участников вашей действующей пары. В рабочую ленту этот результат не добавляется.</p>
    {error && <div role="alert" className="app-panel p-4"><p>{error}</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void reload(); }}>Обновить сравнение</button></div>}
    {!data && !error && <p role="status">Загружаем контекст сравнения…</p>}{saved && <p role="status">Операция подтверждена сервером.</p>}
    {data && <>
      {data.context && <p>Период (UTC): {new Date(data.context.period.startsAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} — {new Date(Date.parse(data.context.period.endsAt) - 1).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}. Условия обоих направлений остаются раздельными.</p>}
      <DirectForm key={`${ownerId}:${data.direct.revision}`} direct={data.direct} role={data.context?.myRole} busy={busy} save={(answers, useForComparison) => mutate({ action: 'save-direct', expectedRevision: data.direct.revision, answers, useForComparison })} />
      <section className="app-panel-soft p-4 space-y-3"><h3 className="font-medium">Прямые ответы в договорённостях пары</h3><p>{data.direct.pairUse ? 'Разрешено использование прямых ответов для договорённостей этой пары.' : 'Использование прямых ответов в договорённостях пары не разрешено.'} Это отдельное назначение от текущего и условного сравнения.</p><button className="app-btn-secondary" disabled={busy || !data.direct.answers} onClick={() => { if (confirmAppNavigation()) void mutate({ action: 'pair-permission', pairUse: !data.direct.pairUse, expectedRevision: data.direct.revision }); }}>{data.direct.pairUse ? 'Отозвать использование в договорённостях' : 'Разрешить использование в договорённостях'}</button></section><div className="flex flex-wrap gap-3"><button className="app-btn-primary" disabled={busy} onClick={() => { if (confirmAppNavigation()) { setSelected([]); void mutate({ action: 'calculate-current' }); } }}>Рассчитать положение сейчас</button>{data.direct.useForComparison && <button className="app-btn-secondary" disabled={busy} onClick={() => void mutate({ action: 'revoke', expectedRevision: data.direct.revision })}>Отозвать использование прямых ответов</button>}</div>
      {data.availability === 'UNAVAILABLE' && <p>Сравнение пока недоступно. Нужны действующая пара, подходящие сохранённые основания и отдельные разрешения обоих участников.</p>}
      {data.current && <section className="app-panel p-4 space-y-3" aria-label="Результат сейчас"><h3 className="font-semibold text-lg">Сейчас: {statusLabels[data.current.status]}</h3><p>{data.current.explanation}</p><dl className="space-y-2"><div><dt>Запрос A к B</dt><dd>{directionLabels[data.current.directions.A_FROM_B]}</dd></div><div><dt>Запрос B к A</dt><dd>{directionLabels[data.current.directions.B_FROM_A]}</dd></div><div><dt>Достаточность общего ресурса</dt><dd>{directionLabels[data.current.resourceStatus]}</dd></div></dl><p>{data.current.completeness === 'BUDGET_EXCEEDED' ? 'Бюджет вычислений превышен; вывод неполон.' : 'Поиск выполнен только в пределах опубликованного набора и лимитов.'}</p><p className="app-muted text-sm">Лимит проверок: {data.current.limits.maxChecks}; изменений одновременно: {data.current.limits.maxActionsPerSet}. Отсутствие плана в этом наборе не доказывает общую невозможность.</p>
        {available.length > 0 && <fieldset disabled={busy} className="space-y-3"><legend className="font-medium">Проверить опубликованные допущения отдельно от текущего результата</legend>{available.map(action => <label key={action.id} className="min-h-11 flex items-start gap-3"><input type="checkbox" checked={selected.includes(action.id as ActionId)} onChange={event => { if (actionId(action.id)) setSelected(previous => event.target.checked ? [...previous, action.id as ActionId] : previous.filter(value => value !== action.id)); }} /><span>{action.label}{action.requiresChoice ? ' Нужен отдельный добровольный выбор участника.' : ''}</span></label>)}<button type="button" className="app-btn-secondary" disabled={selected.length === 0 || selected.some(id => !available.some(action => action.id === id))} onClick={() => void mutate({ action: 'scenario', expectedComparisonRevision: data.current!.revision, actionIds: selected })}>Рассмотреть условный вариант</button></fieldset>}
      </section>}
      {data.scenarios.map(scenario => <article key={scenario.id} className="app-panel-soft p-4 space-y-3" aria-label="Условный сценарий"><h3 className="text-lg font-semibold">Если допущения выполнятся: {statusLabels[scenario.status]}</h3><p className="font-medium">Это условный вариант. Текущий результат не повышен.</p><p>{scenario.explanation}</p><ul className="list-disc pl-5">{scenario.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul><p>{scenario.voluntaryState === 'MODEL_OPTION_NOT_CHOSEN' ? 'Участники ещё не выбрали участие. Это предложение модели, не договорённость.' : 'Заявленная открытость не означает принятую договорённость.'}</p><p>Ваш ресурс за период: обычная задача {scenario.ownResources.ordinaryUse} мин + попытка {scenario.ownResources.attemptUse} мин; доступно {scenario.ownResources.capacity ?? 'неизвестно'} мин.</p><h4 className="font-medium">Чем проверить достигнутое изменение</h4><ul className="list-disc pl-5">{scenario.verification.map(value => <li key={value}>{value}</li>)}</ul>{scenario.baseRevision !== data.current?.revision && <p>Этот вариант рассчитан на прежней редакции исходных данных.</p>}{scenario.completeness === 'BUDGET_EXCEEDED' && <p>Поиск ограничен бюджетом; вариант не является доказательством полного решения.</p>}</article>)}
      <AssessmentPairPanel key={`${ownerId}:${data.context?.pairId ?? 'no-pair'}`} ownerId={ownerId} comparison={data} />
    </>}
  </section>;
}
