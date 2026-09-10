'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import Dialog from '@/components/ui/Dialog';
import { useAssessment } from '@/client/hooks/useAssessment';
import { confirmAppNavigation, useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import type { AssessmentResponse } from '@/domain/assessment/contracts';
import type { AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import { AssessmentProfile } from './AssessmentProfile';
import AssessmentComparisonPanel from './AssessmentComparisonPanel';
import AssessmentPrivacyControls from './AssessmentPrivacyControls';

const missing = [
  { reason: 'SKIPPED', label: 'Пропустить: не хочу отвечать' },
  { reason: 'NO_EXPERIENCE', label: 'Нет такого опыта' },
  { reason: 'NO_OPPORTUNITY', label: 'Не было возможности' },
  { reason: 'UNCLEAR', label: 'Не могу вспомнить или определить' },
] as const;
function ResponseForm({ presentation, previous, busy, onSave, onHint }: {
  presentation: NonNullable<AssessmentRunDTO['presentation']>; previous?: AssessmentResponse;
  busy: boolean; onSave: (response: AssessmentResponse) => Promise<boolean>; onHint: () => void;
}) {
  const { item } = presentation;
  const [response, setResponse] = useState<AssessmentResponse | null>(previous ?? null);
  const [values, setValues] = useState<Record<string, boolean | null>>(previous?.kind === 'FACTS' ? previous.values : {});
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, busy);
  const complete = response?.kind === 'MISSING' || (item.kind === 'OPTION' ? response?.kind === 'OPTION' : response?.kind === 'FACTS' && item.fields.every(field => Object.hasOwn(values, field.id)));
  const setAnswer = (next: AssessmentResponse) => { setResponse(next); setDirty(true); };
  const groups = [...new Set(item.fields.map(field => field.group))];
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (response && complete) void onSave(response).then(saved => { if (saved) setDirty(false); }); }}>
    <h2 className="text-xl font-semibold">{item.title}</h2><p>{item.instructions}</p>
    <p className="app-muted">{item.method === 'SELF_REPORT' ? 'Структурированный самоотчёт об одном эпизоде.' : item.method === 'TASK' ? 'Учебная ситуация, не доказательство реального действия.' : 'Понимание в учебной ситуации.'} {presentation.phase === 'ASSISTED' ? 'Источник учитывает уже показанный образец.' : ''}</p>
    {presentation.hint && <p className="app-panel-soft p-4">{presentation.hint}</p>}
    {item.kind === 'OPTION' && <fieldset disabled={busy} className="app-panel p-4 space-y-3"><legend className="font-semibold">Ваш вариант</legend>{item.options.map(option => <label key={option.id} className="flex gap-3 min-h-11 py-2"><input type="radio" name="assessment-option" checked={response?.kind === 'OPTION' && response.optionId === option.id} onChange={() => setAnswer({ kind: 'OPTION', optionId: option.id })} /><span>{option.label}</span></label>)}</fieldset>}
    {item.kind === 'FACTS' && groups.map(group => <section key={group} className="space-y-3"><h3 className="font-semibold">{group}</h3>{item.fields.filter(field => field.group === group).map(field => <fieldset key={field.id} disabled={busy} className="app-panel p-4"><legend className="px-1">{field.label}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{[{ value: true, label: 'Да' }, { value: false, label: 'Нет' }, { value: null, label: 'Не знаю / не помню' }].map(option => <label key={String(option.value)} className="flex items-center gap-2 min-h-11"><input type="radio" name={field.id} checked={response?.kind === 'FACTS' && Object.hasOwn(values, field.id) && values[field.id] === option.value} onChange={() => { const next = { ...values, [field.id]: option.value }; setValues(next); setAnswer({ kind: 'FACTS', values: next }); }} /><span>{option.label}</span></label>)}</div></fieldset>)}</section>)}
    <fieldset disabled={busy} className="app-panel-soft p-4"><legend className="font-semibold">Можно оставить неизвестным</legend>{missing.map(option => <label key={option.reason} className="flex items-center gap-3 min-h-11"><input type="radio" name="assessment-missing" checked={response?.kind === 'MISSING' && response.reason === option.reason} onChange={() => setAnswer({ kind: 'MISSING', reason: option.reason })} /><span>{option.label}</span></label>)}</fieldset>
    <p role="status" className="app-muted">{busy ? 'Ждём подтверждения сервера…' : dirty ? 'Есть изменения, ещё не сохранённые на сервере.' : previous ? 'Показан ранее сохранённый ответ.' : 'Ответ пока не выбран. Значения заранее не заполнены.'}</p>
    <div className="flex flex-wrap gap-3"><button className="app-btn-primary" disabled={busy || !complete}>{busy ? 'Сохраняем…' : 'Сохранить ответ'}</button><button type="button" className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) onHint(); }}>Показать учебную подсказку</button><Link className="app-btn-secondary inline-flex" href="/profile">Пауза: вернуться в профиль</Link></div>
    <p className="app-muted text-sm">Подсказка сохраняется в происхождении последующих ответов. Клавиатура, масштаб и средства доступности не меняют источник сами по себе.</p>
  </form>;
}
export default function AssessmentPage() {
  const { data, ownerId, error, busy, checkingIdentity, acknowledgement, mutate, reload } = useAssessment();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [review, setReview] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setConfirmDelete(false); setReviewed(false); setReview(false); } });
    return () => { active = false; };
  }, [ownerId]);
  const allAnswered = Boolean(data?.items.filter(item => item.available).every(item => item.answered));
  return <main className="app-shell-dashboard py-4 space-y-5"><BackBar title="Бытовая ответственность" fallbackHref="/profile" />
    <h1 className="text-2xl font-semibold">Полный цикл бытовой ответственности</h1>
    {error && <div role="alert" className="app-panel p-4 space-y-3"><p>{error}</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void reload(); }}>Обновить и восстановить сохранённое</button></div>}
    {!data && !error && <p role="status">Загружаем доступную вам анкету…</p>}
    {!data && error && !checkingIdentity && <AssessmentPrivacyControls />}
    {acknowledgement && <p role="status" className="app-panel-soft p-3">{acknowledgement}</p>}
    {checkingIdentity && <p role="status">Проверяем текущую сессию…</p>}<div hidden={checkingIdentity}>{data && <>
      <p className="app-muted">Авторская пробная публикация {data.publication.version}. Методика ещё не откалибрована. Умение не означает готовность взять обязанность; отсутствие опыта не означает нулевой уровень.</p>
      {data.period && <p>Период самоотчёта (UTC): {new Date(data.period.startsAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} — {new Date(Date.parse(data.period.endsAt) - 1).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}. Каждый выбранный случай должен быть отдельным эпизодом.</p>}
      {data.status === 'NEW' && <section className="app-panel p-4 space-y-3"><p>Сначала опишите реальные бытовые эпизоды за период, затем две учебные ситуации. Можно пропускать вопросы и делать паузу. Сохраняются только явно отправленные ответы; редактирование создаёт новую ревизию.</p><button className="app-btn-primary" disabled={busy} onClick={() => void mutate({ action: 'start' })}>Начать анкету</button></section>}
      {data.status === 'DRAFT' && <><Link className="app-btn-secondary inline-flex" href="/profile">Пауза: вернуться в профиль</Link><p className="app-muted text-sm">Подтверждённые сервером ответы сохранятся для продолжения.</p>
        <nav aria-label="Вопросы анкеты" className="app-panel p-4 space-y-2"><p>Сохранено вопросов: {data.items.filter(item => item.answered).length} из {data.items.filter(item => item.available).length} доступных.</p><ol className="space-y-2">{data.items.map((item, index) => <li key={item.id}><button className="app-btn-secondary text-left" disabled={busy || !item.available} onClick={() => { if (confirmAppNavigation()) { setReview(false); setReviewed(false); void mutate({ action: 'present', itemId: item.id, expectedRevision: data.revision }); } }}>{index + 1}. {item.title} — {item.answered ? 'сохранено' : item.available ? 'не заполнено' : 'нет подходящего эпизода'}</button></li>)}</ol><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) { setReview(true); setReviewed(false); } }}>Проверить ответы перед завершением</button></nav>
        {!review && data.presentation && <ResponseForm key={`${ownerId}:${data.presentation.presentationId}`} presentation={data.presentation} previous={data.answers.find(answer => answer.itemId === data.presentation?.item.id)?.response} busy={busy} onSave={response => mutate({ action: 'answer', presentationId: data.presentation!.presentationId, expectedRevision: data.revision, response })} onHint={() => void mutate({ action: 'hint', itemId: data.presentation!.item.id, expectedRevision: data.revision })} />}
        {review && <section className="app-panel p-4 space-y-4"><h2 className="text-xl font-semibold">Проверка перед завершением</h2><p>Сохранённые ответы можно открыть через список выше и исправить. Пропуски и недостаток независимых эпизодов останутся неизвестностью.</p>{data.items.filter(item => item.available).map(item => { const answer = data.answers.find(value => value.itemId === item.id); return <details key={item.id} className="app-panel-soft p-3"><summary>{item.title}: {answer ? 'сохранено' : 'нужен ответ или явный пропуск'}</summary>{answer && <ul className="list-disc pl-5 mt-3">{answer.summary.map((line, index) => <li key={index}>{line}</li>)}</ul>}</details>; })}<label className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Я проверил ответы и различаю отдельные эпизоды.</label><button className="app-btn-primary" disabled={busy || !allAnswered || !reviewed} onClick={() => void mutate({ action: 'finalize', expectedRevision: data.revision })}>Завершить и рассчитать профиль</button></section>}
      </>}
      {data.status === 'FINALIZED' && <section className="space-y-4">{data.profile && <AssessmentProfile profile={data.profile} />}{data.calculation === 'PENDING' && <button className="app-btn-primary" disabled={busy} onClick={() => void mutate({ action: 'retry' })}>Восстановить расчёт</button>}<button className="app-btn-secondary" disabled={busy} onClick={() => { setReview(false); setReviewed(false); void mutate({ action: 'revise', expectedRevision: data.revision }); }}>Открыть исправление сохранённых ответов</button><p className="app-muted">Исправление заменяет прежнее основание и не начисляет рост. Показанные учебные образцы остаются в происхождении исправленного ответа.</p></section>}
      {data.status !== 'NEW' && data.status !== 'DELETED' && <section className="app-panel p-4 space-y-3"><h2 className="font-semibold">Разрешения и удаление</h2><p>{data.pairUse ? 'Разрешено использовать эти данные для ограниченного сравнения действующей пары.' : 'Данные не разрешены для сравнения пары.'} Сырые ответы доступны только вам.</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void mutate({ action: 'permission', pairUse: !data.pairUse, expectedRevision: data.revision }); }}>{data.pairUse ? 'Отозвать разрешение' : 'Разрешить использование в паре'}</button><p>{data.matchingUse ? 'Разрешено отдельное текущее и условное сравнение двух синтетических участников.' : 'Использование в текущем и условном сравнении не разрешено.'} Это отдельное разрешение; выбор сценария не меняет текущий результат.</p><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void mutate({ action: 'matching-permission', matchingUse: !data.matchingUse, expectedRevision: data.revision }); }}>{data.matchingUse ? 'Отозвать разрешение на сравнение' : 'Разрешить текущее и условное сравнение'}</button><div className="flex gap-3 flex-wrap"><Link className="app-btn-secondary inline-flex" href="/profile/settings">Экспорт моих данных</Link><button className="app-btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>Удалить ответы этой анкеты</button></div></section>}
      {data.status === 'DELETED' && <p>Ответы и рассчитанные показатели удалены. Зависимые сравнения больше не используют это основание.</p>}
      {data.status === 'DELETED' && ownerId && <AssessmentPrivacyControls key={ownerId} />}
      {data.status === 'FINALIZED' && ownerId && <AssessmentComparisonPanel key={ownerId} ownerId={ownerId} />}
    </>}</div>
    <Dialog open={confirmDelete && Boolean(data)} title="Удалить ответы бытовой анкеты?" onClose={() => setConfirmDelete(false)} busy={busy} footer={<><button className="app-btn-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Отмена</button><button className="app-btn-primary" disabled={busy || !data} onClick={() => { if (data) void mutate({ action: 'delete', expectedRevision: data.revision }).then(ok => { if (ok) setConfirmDelete(false); }); }}>Удалить мои ответы</button></>}><p>Сохранённые ответы и их профильная проекция будут удалены. Договорённости не станут доказательством освоенного навыка.</p></Dialog>
  </main>;
}
