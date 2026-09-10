'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import { assessmentBetaApi } from '@/client/api/assessmentBeta';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import { useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import type { AssessmentPortfolioDTO, AssessmentPortfolioMutation, AssessmentPracticeDTO } from '@/lib/dto/assessmentClient.dto';
import { AssessmentProfile } from './AssessmentProfile';

type WithoutOperation<T> = T extends AssessmentPortfolioMutation ? Omit<T, 'idempotencyKey' | 'viewerToken' | 'expectedRevision'> : never;
type Command = WithoutOperation<AssessmentPortfolioMutation>;
const readHub = async (signal: AbortSignal) => {
  const settings = await assessmentBetaApi.settings(signal);
  return { settings, portfolio: settings.admission === 'ACTIVE' && settings.settings.ownerAssessment && settings.mode !== 'OFF' ? await assessmentBetaApi.portfolio(signal) : null };
};
const practiceStatuses = { NO_OPPORTUNITY: 'Не было возможности', NOT_ATTEMPTED: 'Не удалось попробовать', ATTEMPTED: 'Попробовано', DECLINED: 'Решаю не продолжать' } as const;
function PracticeReport({ practice, busy, send }: { practice: AssessmentPracticeDTO; busy: boolean; send: (command: Command) => Promise<boolean> }) {
  const [status, setStatus] = useState<keyof typeof practiceStatuses | ''>('');
  const [note, setNote] = useState(practice.note), [time, setTime] = useState(practice.observedAt?.slice(0, 16) ?? '');
  const [dirty, setDirty] = useState(false); useUnsavedChanges(dirty, busy);
  return <form className="app-panel-soft p-4 space-y-3" onSubmit={event => { event.preventDefault(); if (status) void send({ action: 'practice-report', practiceId: practice.id, practiceRevision: practice.revision, status, note, observedAt: time ? new Date(`${time}:00.000Z`).toISOString() : null }).then(ok => { if (ok) setDirty(false); }); }}>
    <h3 className="font-semibold">Моя цель: {practice.goal}</h3><p>Состояние: {practice.status === 'STARTED' ? 'Выбрана практика' : practiceStatuses[practice.status]}.</p>
    <fieldset disabled={busy}><legend>Что произошло после выбора</legend>{Object.entries(practiceStatuses).map(([value, label]) => <label key={value} className="flex min-h-11 gap-3 items-center"><input type="radio" name={`practice-${practice.id}`} checked={status === value} onChange={() => { setStatus(value as keyof typeof practiceStatuses); setDirty(true); }} />{label}</label>)}</fieldset>
    <label className="block">Когда была попытка (необязательно, UTC)<input className="app-input block w-full" type="datetime-local" value={time} onChange={event => { setTime(event.target.value); setDirty(true); }} /></label>
    <label className="block">Личная заметка (не оценивается)<textarea className="app-input block w-full" maxLength={1200} value={note} onChange={event => { setNote(event.target.value); setDirty(true); }} /></label>
    <p className="app-muted">Этот отчёт фиксирует ваш опыт практики. Новые показатели появляются только из отдельно описанных наблюдений или выполненных заданий.</p><button className="app-btn-primary" disabled={busy || !status}>Сохранить мой опыт</button>
  </form>;
}
function Portfolio({ portfolio, busy, send }: { portfolio: AssessmentPortfolioDTO; busy: boolean; send: (command: Command) => Promise<boolean> }) {
  const [practiceGoal, setPracticeGoal] = useState('');
  const [mode, setMode] = useState<'SOLO_REHEARSAL' | 'OWN_ACTION'>('SOLO_REHEARSAL');
  return <>
    <fieldset className="app-panel p-4" disabled={busy}><legend className="font-semibold">Моя цель сейчас</legend>{[['SELF', 'Для себя'], ['DATING', 'Знакомлюсь'], ['COUPLE', 'В отношениях']].map(([id, title]) => <label key={id} className="flex min-h-11 gap-3 items-center"><input type="radio" name="assessment-goal" checked={portfolio.goal === id} onChange={() => void send({ action: 'goal', goal: id as AssessmentPortfolioDTO['goal'] })} />{title}</label>)}</fieldset>
    <section className="app-panel-soft p-4 space-y-3"><h2 className="text-xl font-semibold">Один полезный следующий шаг</h2><p>{portfolio.planner.message}</p>{portfolio.planner.publicationId && <div className="flex flex-wrap gap-3"><Link className="app-btn-primary inline-flex" href={`/assessments/forms/${encodeURIComponent(portfolio.planner.publicationId)}`}>Открыть предложенный модуль</Link><button className="app-btn-secondary" disabled={busy} onClick={() => void send({ action: 'decline', publicationId: portfolio.planner.publicationId! })}>Сейчас не хочу этот модуль</button></div>}</section>
    <section className="space-y-4" aria-labelledby="assessment-topics"><h2 id="assessment-topics" className="text-xl font-semibold">Темы и сохранённые формы</h2>{[['DOM.S07', 'Бытовая ответственность'], ['COM.S02', 'Конкретная просьба'], ['COM.S04', 'Пауза и возврат к разговору']].map(([id, title]) => <article key={id} className="app-panel p-4 space-y-3"><h3 className="text-lg font-semibold">{title}</h3><ul className="space-y-3">{portfolio.publications.filter(publication => publication.skillId === id).map(publication => <li key={publication.id}><Link className="app-btn-secondary inline-flex text-left" href={publication.id === 'dom-s07-household-pilot' ? '/assessments/dom-s07' : `/assessments/forms/${encodeURIComponent(publication.id)}`}>{publication.title}</Link><p className="app-muted text-sm mt-1">{publication.runStatus === 'DRAFT' ? 'Есть сохранённый черновик' : publication.runStatus === 'FINALIZED' ? 'Ответы завершены' : publication.runStatus === 'DELETED' ? 'Источник удалён' : 'Можно начать по желанию'} · авторский модуль, без психометрической калибровки.</p></li>)}</ul></article>)}</section>
    <AssessmentProfile profile={portfolio.profile} />
    <section className="space-y-4"><h2 className="text-xl font-semibold">Добровольные практики</h2><p>Можно выбрать небольшое действие или репетицию без партнёра. Отказ и отсутствие возможности не снижают результат.</p>
      <label className="block">Какую собственную цель вы выбираете<input className="app-input block w-full" maxLength={300} value={practiceGoal} onChange={event => setPracticeGoal(event.target.value)} placeholder="Например, яснее описать свою просьбу" /></label>
      <fieldset><legend>Способ попытки</legend><label className="flex gap-3 min-h-11 items-center"><input type="radio" name="practice-mode" checked={mode === 'SOLO_REHEARSAL'} onChange={() => setMode('SOLO_REHEARSAL')} />Личная репетиция без партнёра</label><label className="flex gap-3 min-h-11 items-center"><input type="radio" name="practice-mode" checked={mode === 'OWN_ACTION'} onChange={() => setMode('OWN_ACTION')} />Моё добровольное действие</label></fieldset>
      {portfolio.practiceCatalog.map(practice => <article key={practice.skillId} className="app-panel p-4 space-y-3"><h3 className="font-semibold">{practice.title}</h3><p>{practice.action}</p><p>{practice.solo}</p><p className="app-muted">Ресурсы: {practice.resources}</p><p>Когда остановиться: {practice.stop}</p><p>{practice.observation}</p><button className="app-btn-secondary" disabled={busy || !practiceGoal.trim()} onClick={() => void send({ action: 'practice-start', skillId: practice.skillId, goal: practiceGoal, mode })}>Выбрать эту практику</button></article>)}
      {portfolio.practices.map(practice => <PracticeReport key={`${practice.id}:${practice.revision}`} practice={practice} busy={busy} send={send} />)}
    </section>
  </>;
}
export default function AssessmentHubPage() {
  const resource = useAssessmentResource(readHub);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const send = (command: Command) => {
    const fingerprint = JSON.stringify({ owner: resource.ownerId, command });
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, key: crypto.randomUUID() };
    return resource.run(async (current, signal) => { if (current.portfolio) await assessmentBetaApi.updatePortfolio({ ...command, expectedRevision: current.portfolio.revision, viewerToken: current.portfolio.viewerToken, idempotencyKey: receipt.current!.key }, signal); }).then(ok => { if (ok) receipt.current = null; return ok; });
  };
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Навыки и анкеты" fallbackHref="/profile" /><h1 className="text-2xl font-semibold">Навыки и анкеты</h1>
    <p>Выберите одну тему для себя. Общий быт и партнёр не обязательны. Можно читать уже доступный результат, не проходя остальные формы.</p>
    <nav className="flex flex-wrap gap-3" aria-label="Возможности беты"><Link className="app-btn-secondary" href="/assessments/conditions">Мои условия</Link><Link className="app-btn-secondary" href="/assessments/discovery">Знакомства</Link><Link className="app-btn-secondary" href="/assessments/pair">Договорённости пары</Link><Link className="app-btn-secondary" href="/profile/settings#assessment-settings">Мои данные</Link></nav>
    {resource.error && <div role="alert"><p>{resource.error}</p><button className="app-btn-secondary" onClick={() => void resource.reload()} disabled={resource.busy}>Повторить загрузку</button></div>}
    {resource.saved && <p role="status">Выбор сохранён на сервере.</p>}
    {!resource.data && !resource.error && <p role="status">Загружаем доступные вам темы…</p>}
    {resource.data && (resource.data.portfolio ? <Portfolio key={resource.ownerId} portfolio={resource.data.portfolio} busy={resource.busy} send={send} /> : <section className="app-panel p-4 space-y-3"><p>{resource.data.settings.admission === 'INVITED' ? 'Для вас есть приглашение. На одном экране можно прочитать условия и выбрать настройки.' : resource.data.settings.mode === 'OFF' ? 'Новый сбор сейчас остановлен. Ваши настройки и управление существующими данными доступны.' : 'Для продолжения нужен действующий допуск и включённая личная обработка.'}</p><Link className="app-btn-primary inline-flex" href="/assessments/start">Условия и участие</Link><Link className="block underline" href="/profile/settings#assessment-settings">Управлять своими данными</Link></section>)}
  </main>;
}
