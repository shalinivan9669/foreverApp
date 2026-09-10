'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import Dialog from '@/components/ui/Dialog';
import { useAssessment } from '@/client/hooks/useAssessment';
import { confirmAppNavigation, useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import type { AssessmentPeriod, AssessmentResponse } from '@/lib/dto/assessmentClient.dto';
import type { AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import { AssessmentProfile } from './AssessmentProfile';

const missingChoices = [
  ['SKIPPED', 'Не хочу отвечать'], ['NO_EXPERIENCE', 'Нет такого опыта'],
  ['NO_OPPORTUNITY', 'Не было подходящей возможности'], ['UNCLEAR', 'Не помню или не могу определить'],
  ['NONE_FITS', 'Ни один вариант не подходит'], ['NOT_APPLICABLE', 'Ко мне это не относится'],
] as const;
function PeriodForm({ busy, onStart }: { busy: boolean; onStart: (period: AssessmentPeriod) => Promise<boolean> }) {
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [openedAt] = useState(() => Date.now());
  const startMs = start ? Date.parse(`${start}T00:00:00.000Z`) : NaN;
  const endMs = end ? Date.parse(`${end}T00:00:00.000Z`) + 86400000 : NaN;
  const valid = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs && endMs <= openedAt && endMs - startMs <= 90 * 86400000;
  return <form className="app-panel p-4 space-y-3" onSubmit={event => { event.preventDefault(); if (valid) void onStart({ id: `reported-${start}-${end}`, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() }); }}>
    <h2 className="text-xl font-semibold">Завершённый период наблюдений</h2>
    <p>Выберите дни, о которых хотите рассказать, не более 90 дней. Оба дня включены; границы хранятся по UTC. Можно описать меньше эпизодов или завершить без подходящего опыта.</p>
    <div className="grid sm:grid-cols-2 gap-3"><label>Первый день<input type="date" className="app-input block w-full" required value={start} onChange={event => setStart(event.target.value)} /></label><label>Последний завершённый день<input type="date" className="app-input block w-full" required value={end} onChange={event => setEnd(event.target.value)} /></label></div>
    {!valid && (start || end) && <p>Нужен завершённый период: последний день должен закончиться, а конец быть позже начала.</p>}
    <button className="app-btn-primary" disabled={busy || !valid}>Начать отдельную волну наблюдений</button>
  </form>;
}
export function AssessmentResponseForm({ presentation, previous, period, requiresEpisode, knownEpisodes = [], busy, onSave, onHint }: {
  presentation: NonNullable<AssessmentRunDTO['presentation']>; previous?: AssessmentResponse;
  period: AssessmentPeriod | null; requiresEpisode: boolean; busy: boolean;
  knownEpisodes?: NonNullable<AssessmentRunDTO['knownEpisodes']>;
  onSave: (response: AssessmentResponse) => Promise<boolean>; onHint: () => void;
}) {
  const { item } = presentation;
  const [response, setResponse] = useState<AssessmentResponse | null>(previous ?? null);
  const [facts, setFacts] = useState<Record<string, boolean | null>>(previous?.kind === 'FACTS' ? previous.values : {});
  const [slots, setSlots] = useState<Record<string, string>>(previous?.kind === 'STRUCTURED' ? previous.slots : {});
  const [observedAt, setObservedAt] = useState(previous?.kind === 'FACTS' ? previous.episode?.observedAt.slice(0, 16) ?? '' : '');
  const [episodeSelection, setEpisodeSelection] = useState(previous?.kind === 'FACTS' && previous.episode ? previous.episode.sameEpisodeRootId ?? 'NEW' : knownEpisodes.length ? '' : 'NEW');
  const [dirty, setDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useUnsavedChanges(dirty, busy);
  const observationMs = observedAt ? Date.parse(`${observedAt}:00.000Z`) : NaN;
  const observationValid = !requiresEpisode || (episodeSelection !== '' && Number.isFinite(observationMs) && period !== null && observationMs >= Date.parse(period.startsAt) && observationMs < Date.parse(period.endsAt));
  const complete = response?.kind === 'MISSING' || (item.kind === 'OPTION' ? response?.kind === 'OPTION' : item.kind === 'STRUCTURED' ? response?.kind === 'STRUCTURED' && (item.slots ?? []).every(slot => Object.hasOwn(slots, slot.id)) : response?.kind === 'FACTS' && observationValid && item.fields.every(field => Object.hasOwn(facts, field.id)));
  const choose = (value: AssessmentResponse) => { setResponse(value); setDirty(true); };
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault(); if (!response || !complete) return;
    const value = response.kind === 'FACTS' && requiresEpisode ? { ...response, episode: { observedAt: new Date(observationMs).toISOString(), ...(episodeSelection && episodeSelection !== 'NEW' ? { sameEpisodeRootId: episodeSelection } : {}) } } : response;
    void onSave(value).then(ok => { if (ok) setDirty(false); });
  }}>
    <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-offset-4">{item.title}</h2>
    <p className="whitespace-pre-line">{item.instructions}</p>
    <p className="app-muted">{item.method === 'KNOWLEDGE' ? 'Понимание предъявленной ситуации.' : item.method === 'TASK' ? 'Сборка учебного плана. Результат относится только к заданию.' : 'Ваш рассказ об одном реальном эпизоде.'} {presentation.phase === 'ASSISTED' ? 'Учитывается ранее показанный учебный образец.' : ''}</p>
    {presentation.hint && <aside className="app-panel-soft p-3">{presentation.hint}</aside>}
    {item.kind === 'OPTION' && <fieldset disabled={busy} className="app-panel p-4 space-y-3"><legend className="font-semibold">Выберите вариант</legend>{item.options.map(option => <label key={option.id} className="flex min-h-11 gap-3 items-start py-2"><input className="mt-1" type="radio" name="scene-option" checked={response?.kind === 'OPTION' && response.optionId === option.id} onChange={() => choose({ kind: 'OPTION', optionId: option.id })} /><span>{option.label}</span></label>)}</fieldset>}
    {item.kind === 'STRUCTURED' && <><p>Соберите каждый раздел плана. Все действия доступны клавиатурой; перетаскивание не требуется.</p>{item.changedInstructions && <aside className="app-panel-soft p-3"><h3 className="font-semibold">Изменение условий</h3><p>{item.changedInstructions}</p></aside>}{item.slots?.map(slot => <fieldset key={slot.id} disabled={busy} className="app-panel p-4 space-y-2"><legend className="font-semibold">{slot.label}</legend>{slot.options.map(option => <label key={option.id} className="flex min-h-11 items-start gap-3 py-2"><input className="mt-1" type="radio" name={`slot-${slot.id}`} checked={response?.kind === 'STRUCTURED' && slots[slot.id] === option.id} onChange={() => { const next = { ...slots, [slot.id]: option.id }; setSlots(next); choose({ kind: 'STRUCTURED', slots: next }); }} /><span>{option.label}</span></label>)}</fieldset>)}</>}
    {item.kind === 'FACTS' && <>
      {requiresEpisode && knownEpisodes.length > 0 && <label className="block app-panel p-4">Это отдельный эпизод или уже описанный?<select disabled={busy} value={episodeSelection} className="app-input block w-full mt-2" onChange={event => { const value = event.target.value; setEpisodeSelection(value); const selected = knownEpisodes.find(episode => episode.rootId === value); if (selected) setObservedAt(selected.observedAt.slice(0, 16)); setDirty(true); }}><option value="" disabled>Укажите, какой случай описываете</option><option value="NEW">Другой отдельный эпизод этого периода</option>{knownEpisodes.map(episode => <option key={episode.rootId} value={episode.rootId}>{episode.label} · {new Date(episode.observedAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}</option>)}</select><span className="app-muted text-sm">Если речь о том же случае, выберите сохранённое описание. Повтор не увеличивает число эпизодов; несовпадающие ответы сохраняют неизвестность.</span></label>}
      {requiresEpisode && <label className="block app-panel p-4">Когда произошёл этот эпизод (UTC)<input className="app-input block w-full mt-2" disabled={busy || Boolean(episodeSelection && episodeSelection !== 'NEW')} type="datetime-local" value={observedAt} onChange={event => { setObservedAt(event.target.value); setDirty(true); }} /><span className="app-muted text-sm">Укажите время внутри выбранного периода. Разные страницы об одном событии не создают дополнительные эпизоды.</span></label>}
      {[...new Set(item.fields.map(field => field.group))].map(group => <section key={group} className="space-y-3"><h3 className="font-semibold">{group}</h3>{item.fields.filter(field => field.group === group).map(field => <fieldset key={field.id} disabled={busy} className="app-panel p-3"><legend>{field.label}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{[{ value: true, label: 'Да' }, { value: false, label: 'Нет' }, { value: null, label: 'Не знаю / не помню' }].map(option => <label key={String(option.value)} className="flex items-center min-h-11 gap-2"><input type="radio" name={`fact-${field.id}`} checked={response?.kind === 'FACTS' && Object.hasOwn(facts, field.id) && facts[field.id] === option.value} onChange={() => { const next = { ...facts, [field.id]: option.value }; setFacts(next); choose({ kind: 'FACTS', values: next }); }} />{option.label}</label>)}</div></fieldset>)}</section>)}
    </>}
    <fieldset className="app-panel-soft p-4" disabled={busy}><legend className="font-semibold">Можно оставить неизвестным</legend>{missingChoices.map(([reason, label]) => <label key={reason} className="flex min-h-11 items-center gap-3"><input type="radio" name="missing-choice" checked={response?.kind === 'MISSING' && response.reason === reason} onChange={() => choose({ kind: 'MISSING', reason })} />{label}</label>)}</fieldset>
    <p role="status">{busy ? 'Ждём подтверждения сервера…' : dirty ? 'Есть несохранённые изменения.' : previous ? 'Показан сохранённый ответ.' : 'Ответ пока не выбран.'}</p>
    <div className="flex gap-3 flex-wrap"><button className="app-btn-primary" disabled={busy || !complete}>Сохранить ответ</button><button className="app-btn-secondary" type="button" disabled={busy} onClick={() => { if (confirmAppNavigation()) onHint(); }}>Посмотреть объяснение</button><Link href="/assessments" className="app-btn-secondary inline-flex">Пауза</Link></div>
  </form>;
}
export default function AssessmentFormPage({ publicationId }: { publicationId: string }) {
  const resource = useAssessment(publicationId);
  const { data, ownerId, busy, error, checkingIdentity, acknowledgement, mutate } = resource;
  const [review, setReview] = useState(false), [remove, setRemove] = useState(false), [followup, setFollowup] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const requiresPeriod = data?.publication.requiresPeriod ?? publicationId.endsWith('-application-beta');
  const allAnswered = Boolean(data?.items.filter(item => item.available).every(item => item.answered));
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Навыки и анкеты" fallbackHref="/assessments" />
    <h1 className="text-2xl font-semibold">{!checkingIdentity && data ? data.publication.title : 'Анкета'}</h1>
    {error && <div role="alert" className="app-panel p-4 space-y-3"><p>{error}</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void resource.reload(); }}>Проверить сохранённое состояние</button><Link href="/profile/settings#assessment-settings" className="block underline">Настройки и управление данными</Link></div>}
    {(checkingIdentity || (!data && !error)) && <p role="status">Проверяем текущую сессию…</p>}
    {acknowledgement && <p role="status" className="app-panel-soft p-3">{acknowledgement}</p>}
    <div hidden={checkingIdentity} className="space-y-5">{data && <>
      <p className="app-muted">Авторский модуль. Его результаты относятся к предъявленным заданиям и описанным эпизодам. Можно пропустить вопрос или остановиться. Отсутствие данных не означает нулевой навык.</p>
      {data.publication.explanation && <p>{data.publication.explanation}</p>}
      {data.exposureHistory === 'UNKNOWN_AFTER_DELETION' && <p className="app-muted">История прежних объяснений удалена и неизвестна. Это прохождение не объявляется первым без обучения; показанный сейчас образец будет учитываться отдельно.</p>}
      {data.period && <p className="app-muted text-sm">Период источника: {new Date(data.period.startsAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} — {new Date(Date.parse(data.period.endsAt) - 1).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} (UTC).</p>}
      {data.status === 'NEW' && (requiresPeriod ? <PeriodForm busy={busy} onStart={period => mutate({ action: 'start', period })} /> : <section className="app-panel p-4 space-y-3"><p>Одна тема, несколько учебных ситуаций. Сохраняются только отправленные ответы; подтверждённый черновик можно продолжить позднее.</p><button className="app-btn-primary" disabled={busy} onClick={() => void mutate({ action: 'start' })}>Начать</button></section>)}
      {data.status === 'DRAFT' && <>
        {data.retainedCompletedSource === 'CORRECTION' && <p role="status" className="app-panel-soft p-3">Вы исправляете сохранённое основание. Пока исправление не завершено, в результатах используется прежний завершённый источник. После завершения его заменят исправленные ответы. Отозвать разрешение или удалить источник можно сразу.</p>}
        <nav className="app-panel p-4 space-y-3" aria-label="Сохранённые этапы"><p>Сохранено: {data.items.filter(item => item.answered).length} из {data.items.filter(item => item.available).length} доступных этапов.</p><ol className="space-y-2">{data.items.map((item, index) => <li key={item.id}><button className="app-btn-secondary text-left w-full" disabled={busy || !item.available} onClick={() => { if (confirmAppNavigation()) { setReview(false); void mutate({ action: 'present', itemId: item.id, expectedRevision: data.revision }); } }}>{index + 1}. {item.title} · {item.answered ? 'сохранено' : item.available ? 'доступно' : 'не относится к выбранной ветке'}</button></li>)}</ol><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) setReview(true); }}>Проверить и завершить</button></nav>
        {!review && data.presentation && <AssessmentResponseForm key={`${ownerId}:${data.presentation.presentationId}`} presentation={data.presentation} previous={data.answers.find(answer => answer.itemId === data.presentation?.item.id)?.response} period={data.period} requiresEpisode={requiresPeriod} knownEpisodes={data.knownEpisodes} busy={busy} onSave={response => mutate({ action: 'answer', presentationId: data.presentation!.presentationId, expectedRevision: data.revision, response })} onHint={() => void mutate({ action: 'hint', itemId: data.presentation!.item.id, expectedRevision: data.revision })} />}
        {review && <section className="app-panel p-4 space-y-4"><h2 ref={reviewHeading} tabIndex={-1} className="text-xl font-semibold outline-offset-4">Проверка ответов</h2><p>Пропуски останутся неизвестностью. Если нужно, вернитесь к этапу и исправьте ответ.</p>{data.items.filter(item => item.available).map(item => <details key={item.id}><summary>{item.title}: {item.answered ? 'сохранено' : 'нужен ответ или явный пропуск'}</summary><ul className="list-disc pl-5">{data.answers.find(answer => answer.itemId === item.id)?.summary.map((line, index) => <li key={index}>{line}</li>)}</ul></details>)}<button className="app-btn-primary" disabled={busy || !allAnswered} onClick={() => void mutate({ action: 'finalize', expectedRevision: data.revision })}>Завершить и обновить личный результат</button></section>}
      </>}
      {data.status === 'FINALIZED' && <section className="space-y-4">{data.profile && <AssessmentProfile profile={data.profile} />}{data.calculation === 'PENDING' && <p role="status">Ответы сохранены. Фоновое восстановление расчёта выполняется автоматически.</p>}<div className="flex flex-wrap gap-3"><button className="app-btn-secondary" disabled={busy} onClick={() => { setReview(false); void mutate({ action: 'revise', expectedRevision: data.revision }); }}>Исправить это основание</button>{requiresPeriod && <button className="app-btn-secondary" onClick={() => setFollowup(value => !value)}>Описать новый период</button>}</div>{followup && requiresPeriod && <PeriodForm busy={busy} onStart={period => mutate({ action: 'followup', period, expectedRevision: data.revision }).then(ok => { if (ok) setFollowup(false); return ok; })} />}</section>}
      {data.status === 'DELETED' && <p>Ответы этой формы удалены. Зависимые результаты больше не используют их.</p>}
      <section className="app-panel-soft p-4 space-y-3"><h2 className="font-semibold">Управление источником</h2><p>Действуют сохранённые настройки назначения и получателей. Исправление заменяет именно это основание; новая учебная форма не стирает описанное применение.</p><div className="flex flex-wrap gap-3"><Link href="/profile/settings#assessment-settings" className="underline">Настройки, отзыв, экспорт и удаление</Link><Link href="/assessments/support" className="underline">Мне не подходит результат</Link>{data.status !== 'NEW' && data.status !== 'DELETED' && <button className="app-btn-secondary" disabled={busy} onClick={() => setRemove(true)}>Удалить ответы этой формы</button>}</div></section>
    </>}</div>
    <Dialog open={remove && Boolean(data)} title="Удалить ответы этой формы?" onClose={() => setRemove(false)} busy={busy} footer={<><button className="app-btn-secondary" disabled={busy} onClick={() => setRemove(false)}>Отмена</button><button className="app-btn-primary" disabled={busy || !data} onClick={() => { if (data) void mutate({ action: 'delete', expectedRevision: data.revision }).then(ok => { if (ok) setRemove(false); }); }}>Удалить мои ответы</button></>}><p>Расчёт перестанет использовать этот источник. Другие ваши формы и отдельные отчёты партнёра сохраняют собственное авторство.</p></Dialog>
  </main>;
}
