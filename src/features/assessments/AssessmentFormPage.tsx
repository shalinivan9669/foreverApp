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
  return <form className="app-panel app-assessment-form-sheet" onSubmit={event => { event.preventDefault(); if (valid) void onStart({ id: `reported-${start}-${end}`, startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() }); }}>
    <h2 className="text-xl font-semibold">Завершённый период наблюдений</h2>
    <p>Выберите дни, о которых хотите рассказать, не более 90 дней. Оба дня включены; границы хранятся по UTC. Можно описать меньше эпизодов или завершить без подходящего опыта.</p>
    <div className="grid sm:grid-cols-2 gap-4"><label className="app-assessment-form-field-label">Первый день<input type="date" className="app-input block w-full" disabled={busy} required value={start} onChange={event => setStart(event.target.value)} /></label><label className="app-assessment-form-field-label">Последний завершённый день<input type="date" className="app-input block w-full" disabled={busy} required value={end} onChange={event => setEnd(event.target.value)} /></label></div>
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
  return <form className="app-panel app-assessment-form-response-form" onSubmit={event => {
    event.preventDefault(); if (!response || !complete) return;
    const value = response.kind === 'FACTS' && requiresEpisode ? { ...response, episode: { observedAt: new Date(observationMs).toISOString(), ...(episodeSelection && episodeSelection !== 'NEW' ? { sameEpisodeRootId: episodeSelection } : {}) } } : response;
    void onSave(value).then(ok => { if (ok) setDirty(false); });
  }}>
    <header className="app-assessment-form-question-header">
      <span className="app-assessment-form-eyebrow">{item.kind === 'OPTION' ? 'Одна ситуация · один ответ' : item.kind === 'STRUCTURED' ? 'Соберите свой план' : 'Вспомните свой опыт'}</span>
      <h2 ref={heading} tabIndex={-1} className="app-assessment-form-question-title">{item.title}</h2>
      <p className="app-assessment-form-instructions">{item.instructions}</p>
      <p className="app-assessment-form-method-note">{item.method === 'KNOWLEDGE' ? 'Понимание предъявленной ситуации.' : item.method === 'TASK' ? 'Сборка учебного плана. Результат относится только к заданию.' : 'Ваш рассказ об одном реальном эпизоде.'} {presentation.phase === 'ASSISTED' ? 'Учитывается ранее показанный учебный образец.' : ''}</p>
    </header>
    {presentation.hint && <aside className="app-panel-soft app-assessment-form-note"><h3 className="font-semibold">Объяснение</h3><p>{presentation.hint}</p></aside>}
    {item.kind === 'OPTION' && <fieldset disabled={busy} className="app-assessment-form-choice-group">
      <legend>Выберите вариант</legend>
      <div className="app-assessment-form-choices">{item.options.map(option => <label key={option.id} className="app-assessment-form-choice">
        <input type="radio" name="scene-option" checked={response?.kind === 'OPTION' && response.optionId === option.id} onChange={() => choose({ kind: 'OPTION', optionId: option.id })} />
        <span>{option.label}</span>
      </label>)}</div>
    </fieldset>}
    {item.kind === 'STRUCTURED' && <>
      <p className="app-assessment-form-method-note">Соберите каждый раздел плана. Все действия доступны клавиатурой; перетаскивание не требуется.</p>
      {item.changedInstructions && <aside className="app-panel-soft app-assessment-form-note"><h3 className="font-semibold">Изменение условий</h3><p>{item.changedInstructions}</p></aside>}
      {item.slots?.map((slot, index) => <fieldset key={slot.id} disabled={busy} className="app-assessment-form-choice-group">
        <legend><span className="app-assessment-form-section-number" aria-hidden="true">{index + 1}</span>{slot.label}</legend>
        <div className="app-assessment-form-choices">{slot.options.map(option => <label key={option.id} className="app-assessment-form-choice">
          <input type="radio" name={`slot-${slot.id}`} checked={response?.kind === 'STRUCTURED' && slots[slot.id] === option.id} onChange={() => { const next = { ...slots, [slot.id]: option.id }; setSlots(next); choose({ kind: 'STRUCTURED', slots: next }); }} />
          <span>{option.label}</span>
        </label>)}</div>
      </fieldset>)}
    </>}
    {item.kind === 'FACTS' && <>
      {requiresEpisode && knownEpisodes.length > 0 && <label className="app-assessment-form-field-label">Это отдельный эпизод или уже описанный?<select disabled={busy} value={episodeSelection} className="app-input block w-full" onChange={event => { const value = event.target.value; setEpisodeSelection(value); const selected = knownEpisodes.find(episode => episode.rootId === value); if (selected) setObservedAt(selected.observedAt.slice(0, 16)); setDirty(true); }}><option value="" disabled>Укажите, какой случай описываете</option><option value="NEW">Другой отдельный эпизод этого периода</option>{knownEpisodes.map(episode => <option key={episode.rootId} value={episode.rootId}>{episode.label} · {new Date(episode.observedAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}</option>)}</select><span className="app-assessment-form-method-note">Если речь о том же случае, выберите сохранённое описание. Повтор не увеличивает число эпизодов; несовпадающие ответы сохраняют неизвестность.</span></label>}
      {requiresEpisode && <label className="app-assessment-form-field-label">Когда произошёл этот эпизод (UTC)<input className="app-input block w-full" disabled={busy || Boolean(episodeSelection && episodeSelection !== 'NEW')} type="datetime-local" value={observedAt} onChange={event => { setObservedAt(event.target.value); setDirty(true); }} /><span className="app-assessment-form-method-note">Укажите время внутри выбранного периода. Разные страницы об одном событии не создают дополнительные эпизоды.</span></label>}
      {[...new Set(item.fields.map(field => field.group))].map(group => <section key={group} className="app-assessment-form-fact-group">
        <h3 className="font-semibold">{group}</h3>
        {item.fields.filter(field => field.group === group).map(field => <fieldset key={field.id} disabled={busy} className="app-assessment-form-fact-field">
          <legend>{field.label}</legend>
          <div className="app-assessment-form-fact-choices">{[{ value: true, label: 'Да' }, { value: false, label: 'Нет' }, { value: null, label: 'Не знаю / не помню' }].map(option => <label key={String(option.value)} className="app-assessment-form-choice">
            <input type="radio" name={`fact-${field.id}`} checked={response?.kind === 'FACTS' && Object.hasOwn(facts, field.id) && facts[field.id] === option.value} onChange={() => { const next = { ...facts, [field.id]: option.value }; setFacts(next); choose({ kind: 'FACTS', values: next }); }} />
            <span>{option.label}</span>
          </label>)}</div>
        </fieldset>)}
      </section>)}
    </>}
    <details className="app-assessment-form-skip-section" open={previous?.kind === 'MISSING' || undefined}>
      <summary>Можно оставить неизвестным<span className="app-assessment-form-method-note">Не хотите отвечать или нет подходящего опыта?</span></summary>
      <fieldset disabled={busy} className="app-assessment-form-choice-group">
        <legend className="sr-only">Причина пропуска</legend>
        <div className="app-assessment-form-skip-choices">{missingChoices.map(([reason, label]) => <label key={reason} className="app-assessment-form-choice">
          <input type="radio" name="missing-choice" checked={response?.kind === 'MISSING' && response.reason === reason} onChange={() => choose({ kind: 'MISSING', reason })} />
          <span>{label}</span>
        </label>)}</div>
      </fieldset>
    </details>
    <footer className="app-assessment-form-action-area">
      <p role="status" className="app-assessment-form-save-status"><span className="app-assessment-form-status-dot" data-state={busy ? 'busy' : dirty ? 'dirty' : previous ? 'saved' : 'empty'} aria-hidden="true" />{busy ? 'Ждём подтверждения сервера…' : dirty ? 'Есть несохранённые изменения.' : previous ? 'Показан сохранённый ответ.' : 'Ответ пока не выбран.'}</p>
      <div className="app-assessment-form-actions"><button className="app-btn-primary" disabled={busy || !complete}>Сохранить ответ<span aria-hidden="true">→</span></button><button className="app-btn-secondary" type="button" disabled={busy} onClick={() => { if (confirmAppNavigation()) onHint(); }}>Посмотреть объяснение</button><Link href="/assessments" className="app-btn-secondary inline-flex">Пауза</Link></div>
    </footer>
  </form>;
}

function AssessmentStages({ data, busy, review, onPresent, onReview }: {
  data: AssessmentRunDTO; busy: boolean; review: boolean;
  onPresent: (itemId: string) => void; onReview: () => void;
}) {
  const availableItems = data.items.filter(item => item.available);
  const savedCount = availableItems.filter(item => item.answered).length;
  return <nav className="app-assessment-form-stage-navigation" aria-label="Сохранённые этапы">
    <div className="app-assessment-form-progress-heading"><span className="app-assessment-form-eyebrow">Ваш темп</span><strong>{savedCount} / {availableItems.length}</strong></div>
    <p className="app-assessment-form-method-note">Сохранено: {savedCount} из {availableItems.length} доступных этапов.</p>
    <progress className="app-assessment-form-progress" value={savedCount} max={Math.max(availableItems.length, 1)} aria-label="Сохранённые этапы" />
    <ol className="app-assessment-form-stage-list">{data.items.map((item, index) => <li key={item.id}>
      <button className="app-assessment-form-stage-button" aria-current={!review && data.presentation?.item.id === item.id ? 'step' : undefined} disabled={busy || !item.available} onClick={() => onPresent(item.id)}>
        <span className="app-assessment-form-stage-number" data-saved={item.answered} aria-hidden="true">{item.answered ? '✓' : index + 1}</span>
        <span><span className="app-assessment-form-stage-title">{item.title}</span><span className="app-assessment-form-stage-status">{item.answered ? 'Сохранено' : item.available ? 'Доступно' : 'Не относится к выбранной ветке'}</span></span>
      </button>
    </li>)}</ol>
    <button className="app-btn-secondary w-full" aria-current={review ? 'step' : undefined} disabled={busy} onClick={onReview}>Проверить и завершить</button>
    <p className="app-assessment-form-method-note">Можно сделать паузу. Отправленные ответы сохранятся.</p>
  </nav>;
}

export default function AssessmentFormPage({ publicationId }: { publicationId: string }) {
  const resource = useAssessment(publicationId);
  const { data, ownerId, busy, error, checkingIdentity, acknowledgement, mutate } = resource;
  const [review, setReview] = useState(false), [remove, setRemove] = useState(false), [followup, setFollowup] = useState(false);
  const mobileStages = useRef<HTMLDetailsElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const requiresPeriod = data?.publication.requiresPeriod ?? publicationId.endsWith('-application-beta');
  const allAnswered = Boolean(data?.items.filter(item => item.available).every(item => item.answered));
  const availableItems = data?.items.filter(item => item.available) ?? [];
  const savedCount = availableItems.filter(item => item.answered).length;
  const currentItemIndex = data?.items.findIndex(item => item.id === data.presentation?.item.id) ?? -1;
  const presentItem = (itemId: string) => {
    if (data && confirmAppNavigation()) {
      setReview(false);
      if (mobileStages.current) mobileStages.current.open = false;
      void mutate({ action: 'present', itemId, expectedRevision: data.revision });
    }
  };
  const openReview = () => {
    if (confirmAppNavigation()) {
      setReview(true);
      if (mobileStages.current) mobileStages.current.open = false;
    }
  };
  return <main className="app-shell-compact app-assessment-form-page"><BackBar title="Навыки и анкеты" fallbackHref="/assessments" />
    <h1 className="app-assessment-form-page-title">{!checkingIdentity && data ? data.publication.title : 'Анкета'}</h1>
    {error && <div role="alert" className="app-panel p-4 space-y-3"><p>{error}</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void resource.reload(); }}>Проверить сохранённое состояние</button><Link href="/profile/settings#assessment-settings" className="block underline">Настройки и управление данными</Link></div>}
    {(checkingIdentity || (!data && !error)) && <p role="status">Проверяем текущую сессию…</p>}
    {acknowledgement && <p role="status" className="app-panel-soft p-3">{acknowledgement}</p>}
    <div hidden={checkingIdentity} className="space-y-5">{data && <>
      <details className="app-assessment-form-about" open={data.status === 'NEW' || undefined}>
        <summary>Об анкете и ваших ответах<span className="app-assessment-form-method-note">Можно пропустить вопрос или остановиться</span></summary>
        <div className="app-assessment-form-about-body"><p className="app-muted">Авторский модуль. Его результаты относятся к предъявленным заданиям и описанным эпизодам. Можно пропустить вопрос или остановиться. Отсутствие данных не означает нулевой навык.</p>
        {data.publication.explanation && <p>{data.publication.explanation}</p>}</div>
      </details>
      {data.exposureHistory === 'UNKNOWN_AFTER_DELETION' && <p className="app-muted">История прежних объяснений удалена и неизвестна. Это прохождение не объявляется первым без обучения; показанный сейчас образец будет учитываться отдельно.</p>}
      {data.period && <p className="app-muted text-sm">Период источника: {new Date(data.period.startsAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} — {new Date(Date.parse(data.period.endsAt) - 1).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} (UTC).</p>}
      {data.status === 'NEW' && (requiresPeriod ? <PeriodForm busy={busy} onStart={period => mutate({ action: 'start', period })} /> : <section className="app-panel app-assessment-form-sheet"><span className="app-assessment-form-eyebrow">Немного внимания себе</span><h2 className="text-2xl font-semibold">В удобном для вас темпе</h2><p>Одна тема, несколько учебных ситуаций. Сохраняются только отправленные ответы; подтверждённый черновик можно продолжить позднее.</p><button className="app-btn-primary self-start" disabled={busy} onClick={() => void mutate({ action: 'start' })}>Начать<span aria-hidden="true">→</span></button></section>)}
      {data.status === 'DRAFT' && <>
        {data.retainedCompletedSource === 'CORRECTION' && <p role="status" className="app-panel-soft p-3">Вы исправляете сохранённое основание. Пока исправление не завершено, в результатах используется прежний завершённый источник. После завершения его заменят исправленные ответы. Отозвать разрешение или удалить источник можно сразу.</p>}
        <div className="app-assessment-form-workspace">
          <aside className="app-panel-soft app-assessment-form-desktop-stages"><AssessmentStages data={data} busy={busy} review={review} onPresent={presentItem} onReview={openReview} /></aside>
          <details ref={mobileStages} className="app-panel-soft app-assessment-form-mobile-stages">
            <summary><span><strong>{review ? 'Проверка ответов' : currentItemIndex >= 0 ? `Сейчас этап ${currentItemIndex + 1}` : 'Этапы анкеты'}</strong><span className="app-assessment-form-stage-status">Сохранено {savedCount} из {availableItems.length} · открыть все этапы</span></span></summary>
            <AssessmentStages data={data} busy={busy} review={review} onPresent={presentItem} onReview={openReview} />
          </details>
          <div className="app-assessment-form-question-column">
            {!review && data.presentation && <AssessmentResponseForm key={`${ownerId}:${data.presentation.presentationId}`} presentation={data.presentation} previous={data.answers.find(answer => answer.itemId === data.presentation?.item.id)?.response} period={data.period} requiresEpisode={requiresPeriod} knownEpisodes={data.knownEpisodes} busy={busy} onSave={response => mutate({ action: 'answer', presentationId: data.presentation!.presentationId, expectedRevision: data.revision, response })} onHint={() => void mutate({ action: 'hint', itemId: data.presentation!.item.id, expectedRevision: data.revision })} />}
            {review && <section className="app-panel app-assessment-form-sheet">
              <span className="app-assessment-form-eyebrow">Последний шаг</span>
              <h2 ref={reviewHeading} tabIndex={-1} className="app-assessment-form-question-title">Проверка ответов</h2>
              <p>Пропуски останутся неизвестностью. Если нужно, вернитесь к этапу и исправьте ответ.</p>
              <div className="app-assessment-form-review-list">{availableItems.map(item => <details key={item.id} className="app-assessment-form-review-item">
                <summary>{item.title}<span className="app-assessment-form-stage-status">{item.answered ? 'Сохранено' : 'Нужен ответ или явный пропуск'}</span></summary>
                <ul className="list-disc pl-5">{data.answers.find(answer => answer.itemId === item.id)?.summary.map((line, index) => <li key={index}>{line}</li>)}</ul>
                <button className="app-btn-secondary" disabled={busy} onClick={() => presentItem(item.id)}>{item.answered ? 'Изменить ответ' : 'Перейти к этапу'}</button>
              </details>)}</div>
              {!allAnswered && <p className="app-assessment-form-method-note">До завершения нужно сохранить ответ или явный пропуск на каждом доступном этапе.</p>}
              <button className="app-btn-primary" disabled={busy || !allAnswered} onClick={() => void mutate({ action: 'finalize', expectedRevision: data.revision })}>Завершить и обновить личный результат</button>
            </section>}
          </div>
        </div>
      </>}
      {data.status === 'FINALIZED' && <section className="space-y-4">{data.profile && <AssessmentProfile profile={data.profile} />}{data.calculation === 'PENDING' && <p role="status">Ответы сохранены. Фоновое восстановление расчёта выполняется автоматически.</p>}<div className="flex flex-wrap gap-3"><button className="app-btn-secondary" disabled={busy} onClick={() => { setReview(false); void mutate({ action: 'revise', expectedRevision: data.revision }); }}>Исправить это основание</button>{requiresPeriod && <button className="app-btn-secondary" onClick={() => setFollowup(value => !value)}>Описать новый период</button>}</div>{followup && requiresPeriod && <PeriodForm busy={busy} onStart={period => mutate({ action: 'followup', period, expectedRevision: data.revision }).then(ok => { if (ok) setFollowup(false); return ok; })} />}</section>}
      {data.status === 'DELETED' && <p>Ответы этой формы удалены. Зависимые результаты больше не используют их.</p>}
      <section className="app-panel-soft app-assessment-form-source-settings"><h2 className="font-semibold">Управление источником</h2><p>Действуют сохранённые настройки назначения и получателей. Исправление заменяет именно это основание; новая учебная форма не стирает описанное применение.</p><div className="flex flex-wrap gap-3"><Link href="/profile/settings#assessment-settings" className="underline">Настройки, отзыв, экспорт и удаление</Link><Link href="/assessments/support" className="underline">Мне не подходит результат</Link>{data.status !== 'NEW' && data.status !== 'DELETED' && <button className="app-btn-secondary" disabled={busy} onClick={() => setRemove(true)}>Удалить ответы этой формы</button>}</div></section>
    </>}</div>
    <Dialog open={remove && Boolean(data)} title="Удалить ответы этой формы?" onClose={() => setRemove(false)} busy={busy} footer={<><button className="app-btn-secondary" disabled={busy} onClick={() => setRemove(false)}>Отмена</button><button className="app-btn-primary" disabled={busy || !data} onClick={() => { if (data) void mutate({ action: 'delete', expectedRevision: data.revision }).then(ok => { if (ok) setRemove(false); }); }}>Удалить мои ответы</button></>}><p>Расчёт перестанет использовать этот источник. Другие ваши формы и отдельные отчёты партнёра сохраняют собственное авторство.</p></Dialog>
  </main>;
}
