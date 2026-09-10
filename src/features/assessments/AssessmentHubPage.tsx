'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
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
const topics = [
  { id: 'DOM.S07', title: 'Бытовая ответственность', description: 'Как брать на себя задачи и доводить договорённости до результата.', tone: 'mint', symbol: '⌂' },
  { id: 'COM.S02', title: 'Конкретная просьба', description: 'Как понятно сказать, что вам нужно, и услышать ответ.', tone: 'rose', symbol: '↗' },
  { id: 'COM.S04', title: 'Пауза и возврат к разговору', description: 'Как сделать паузу и вернуться к тому, что важно обсудить.', tone: 'plum', symbol: '↺' },
] as const;
const goals = [
  { id: 'SELF', title: 'Для себя', description: 'Лучше понять свой опыт' },
  { id: 'DATING', title: 'Знакомлюсь', description: 'Разобраться в своих ожиданиях' },
  { id: 'COUPLE', title: 'В отношениях', description: 'Внимательнее к совместной жизни' },
] as const;
const workspaceTabs = [
  { id: 'topics', label: 'Анкеты' },
  { id: 'results', label: 'Мои результаты' },
  { id: 'practices', label: 'Практики' },
] as const;
function PracticeReport({ practice, busy, send }: { practice: AssessmentPracticeDTO; busy: boolean; send: (command: Command) => Promise<boolean> }) {
  const [status, setStatus] = useState<keyof typeof practiceStatuses | ''>('');
  const [note, setNote] = useState(practice.note), [time, setTime] = useState(practice.observedAt?.slice(0, 16) ?? '');
  const [dirty, setDirty] = useState(false); useUnsavedChanges(dirty, busy);
  return <form className={`app-panel aw-practiceReport`} onSubmit={event => { event.preventDefault(); if (status) void send({ action: 'practice-report', practiceId: practice.id, practiceRevision: practice.revision, status, note, observedAt: time ? new Date(`${time}:00.000Z`).toISOString() : null }).then(ok => { if (ok) setDirty(false); }); }}>
    <header className="aw-sectionHeading"><div><p className="aw-eyebrow">Мой опыт</p><h3>Моя цель: {practice.goal}</h3></div><span className="aw-status">{practice.status === 'STARTED' ? 'Выбрана практика' : practiceStatuses[practice.status]}</span></header>
    <fieldset disabled={busy}><legend className="aw-fieldLegend">Что произошло после выбора</legend><div className="aw-reportChoices">{Object.entries(practiceStatuses).map(([value, label]) => <label key={value} className="aw-choice"><input type="radio" name={`practice-${practice.id}`} checked={status === value} onChange={() => { setStatus(value as keyof typeof practiceStatuses); setDirty(true); }} /><span>{label}</span></label>)}</div></fieldset>
    <div className="aw-reportFields">
      <label className="aw-field">Когда была попытка <span className="app-muted text-sm">Необязательно · время UTC</span><input className="app-input block w-full" type="datetime-local" value={time} onChange={event => { setTime(event.target.value); setDirty(true); }} /></label>
      <label className="aw-field">Личная заметка <span className="app-muted text-sm">Не оценивается</span><textarea className="app-input block w-full" rows={4} maxLength={1200} value={note} onChange={event => { setNote(event.target.value); setDirty(true); }} /></label>
    </div>
    <p className="aw-quiet">Этот отчёт фиксирует ваш опыт практики. Новые показатели появляются только из отдельно описанных наблюдений или выполненных заданий.</p><button className="app-btn-primary" disabled={busy || !status}>Сохранить мой опыт</button>
  </form>;
}
function Portfolio({ portfolio, busy, send }: { portfolio: AssessmentPortfolioDTO; busy: boolean; send: (command: Command) => Promise<boolean> }) {
  const [practiceGoal, setPracticeGoal] = useState('');
  const [mode, setMode] = useState<'SOLO_REHEARSAL' | 'OWN_ACTION'>('SOLO_REHEARSAL');
  const [activeTab, setActiveTab] = useState<(typeof workspaceTabs)[number]['id']>('topics');
  const tabPrefix = useId();
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  return <>
    <fieldset className="aw-goalSection" disabled={busy}>
      <legend className="aw-fieldLegend">Моя цель сейчас</legend>
      <div className="aw-goalGrid">{goals.map(({ id, title, description }) => <label key={id} className="aw-choice"><input type="radio" name="assessment-goal" checked={portfolio.goal === id} onChange={() => void send({ action: 'goal', goal: id })} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div>
    </fieldset>
    <div className="aw-sectionNav" role="tablist" aria-label="Разделы анкет">{workspaceTabs.map(({ id, label }, index) => <button
      key={id}
      ref={element => { tabButtons.current[index] = element; }}
      type="button"
      role="tab"
      id={`${tabPrefix}-tab-${id}`}
      aria-controls={`${tabPrefix}-panel-${id}`}
      aria-selected={activeTab === id}
      tabIndex={activeTab === id ? 0 : -1}
      disabled={busy}
      onClick={() => setActiveTab(id)}
      onKeyDown={event => {
        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % workspaceTabs.length : event.key === 'ArrowLeft' ? (index + workspaceTabs.length - 1) % workspaceTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? workspaceTabs.length - 1 : null;
        if (nextIndex === null) return;
        event.preventDefault();
        setActiveTab(workspaceTabs[nextIndex].id);
        tabButtons.current[nextIndex]?.focus();
      }}
    >{label}</button>)}</div>
    <div id={`${tabPrefix}-panel-topics`} className="aw-section aw-panel" role="tabpanel" aria-labelledby={`${tabPrefix}-tab-topics`} hidden={activeTab !== 'topics'} tabIndex={0}>
    <section className="aw-nextStep">
      <div className="aw-stepMark" aria-hidden="true">↗</div>
      <div className="aw-stepContent"><p className="aw-eyebrow">В своём темпе</p><h2>Один полезный следующий шаг</h2><p>{portfolio.planner.message}</p>{portfolio.planner.publicationId && <div className="aw-actions"><Link className="app-btn-primary inline-flex" href={`/assessments/forms/${encodeURIComponent(portfolio.planner.publicationId)}`}>Открыть предложенный модуль <span aria-hidden="true">→</span></Link><button className="app-btn-secondary" disabled={busy} onClick={() => void send({ action: 'decline', publicationId: portfolio.planner.publicationId! })}>Сейчас не хочу этот модуль</button></div>}</div>
    </section>
    <section id="assessment-topics" className="aw-section" aria-labelledby="assessment-topics-title">
      <header className="aw-sectionHeading"><div><p className="aw-eyebrow">Выберите, что вам ближе</p><h2 id="assessment-topics-title">Темы и сохранённые формы</h2></div><p className="aw-quiet">Начать с любой темы.<br />Продолжить с сохранённого места.</p></header>
      <div className="aw-topicGrid">{topics.map(({ id, title, description, tone, symbol }, index) => {
        const publications = portfolio.publications.filter(publication => publication.skillId === id);
        return <article key={id} className="aw-topicCard" data-tone={tone}>
          <header className="aw-topicHeader"><span className="aw-topicSymbol" aria-hidden="true">{symbol}</span><span className="aw-topicNumber" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{description}</p></header>
          <ul className="aw-formList">{publications.map(publication => <li key={publication.id}><Link className="aw-formLink" href={publication.id === 'dom-s07-household-pilot' ? '/assessments/dom-s07' : `/assessments/forms/${encodeURIComponent(publication.id)}`}><span className="aw-formInfo"><span className="aw-status" data-status={publication.runStatus}>{publication.runStatus === 'DRAFT' ? 'Есть сохранённый черновик' : publication.runStatus === 'FINALIZED' ? 'Ответы завершены' : publication.runStatus === 'DELETED' ? 'Источник удалён' : 'Можно начать по желанию'}</span><strong>{publication.title}</strong></span><span className="aw-linkArrow" aria-hidden="true">→</span></Link></li>)}</ul>
          <p className="aw-topicNote">Авторские модули, без психометрической калибровки.</p>
        </article>;
      })}</div>
    </section>
    </div>
    <div id={`${tabPrefix}-panel-results`} className="aw-section aw-panel" role="tabpanel" aria-labelledby={`${tabPrefix}-tab-results`} hidden={activeTab !== 'results'} tabIndex={0}><AssessmentProfile profile={portfolio.profile} /></div>
    <section id={`${tabPrefix}-panel-practices`} className="aw-section aw-panel" role="tabpanel" aria-labelledby={`${tabPrefix}-tab-practices`} hidden={activeTab !== 'practices'} tabIndex={0}>
      <header className="aw-sectionHeading"><div><p className="aw-eyebrow">От размышления к действию</p><h2>Добровольные практики</h2></div></header>
      <p className="aw-intro">Можно выбрать небольшое действие или репетицию без партнёра. Отказ и отсутствие возможности не снижают результат.</p>
      <div className={`app-panel aw-practiceSetup`}>
        <label className="aw-field">Какую собственную цель вы выбираете<input className="app-input block w-full" maxLength={300} value={practiceGoal} onChange={event => setPracticeGoal(event.target.value)} placeholder="Например, яснее описать свою просьбу" /></label>
        <fieldset><legend className="aw-fieldLegend">Способ попытки</legend><div className="aw-modeGrid"><label className="aw-choice"><input type="radio" name="practice-mode" checked={mode === 'SOLO_REHEARSAL'} onChange={() => setMode('SOLO_REHEARSAL')} /><span>Личная репетиция без партнёра</span></label><label className="aw-choice"><input type="radio" name="practice-mode" checked={mode === 'OWN_ACTION'} onChange={() => setMode('OWN_ACTION')} /><span>Моё добровольное действие</span></label></div></fieldset>
        {!practiceGoal.trim() && <p className="aw-quiet">Сначала запишите свою цель — затем можно выбрать практику ниже.</p>}
      </div>
      <div className="aw-practiceGrid">{portfolio.practiceCatalog.map(practice => <article key={practice.skillId} className={`app-panel aw-practiceCard`}>
        <h3>{practice.title}</h3><p>{practice.action}</p><p>{practice.solo}</p>
        <div className="aw-practiceNotes"><p><strong>Ресурсы</strong>{practice.resources}</p><p><strong>Когда остановиться</strong>{practice.stop}</p><p>{practice.observation}</p></div>
        <button className="app-btn-secondary" disabled={busy || !practiceGoal.trim()} onClick={() => void send({ action: 'practice-start', skillId: practice.skillId, goal: practiceGoal, mode })}>Выбрать эту практику</button>
      </article>)}</div>
      {portfolio.practices.map(practice => <PracticeReport key={`${practice.id}:${practice.revision}`} practice={practice} busy={busy} send={send} />)}
    </section>
  </>;
}
export default function AssessmentHubPage({ embedded = false }: { embedded?: boolean }) {
  const resource = useAssessmentResource(readHub);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const send = (command: Command) => {
    const fingerprint = JSON.stringify({ owner: resource.ownerId, command });
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, key: crypto.randomUUID() };
    return resource.run(async (current, signal) => { if (current.portfolio) await assessmentBetaApi.updatePortfolio({ ...command, expectedRevision: current.portfolio.revision, viewerToken: current.portfolio.viewerToken, idempotencyKey: receipt.current!.key }, signal); }).then(ok => { if (ok) receipt.current = null; return ok; });
  };
  const Container = embedded ? 'section' : 'main';
  const settings = resource.data?.settings;
  const setupAvailable = settings?.admission === 'ELIGIBLE' || settings?.admission === 'INVITED' || (settings?.mode === 'REGISTERED' && settings.admission === 'REVOKED');
  return <Container className={`aw-workspace ${embedded ? '' : 'app-shell py-5'}`}>
    {!embedded && <BackBar title="Анкеты" fallbackHref="/main-menu" />}
    <header className={`aw-hero${embedded ? ' aw-heroCompact' : ''}`}>
      <div className="aw-heroCopy">{embedded ? <><h2>Ближе к себе, понятнее друг другу.</h2><p>Выберите тему и исследуйте её в своём темпе.</p></> : <><p className="aw-eyebrow">Немного внимания к себе</p><h1>Анкеты и навыки</h1><p className="aw-intro">Ближе к себе.<br />Понятнее друг другу.</p><p>Выберите тему и исследуйте её в своём темпе. Понимание, выполнение задания и применение в жизни разбираются отдельно.</p></>}<div className="aw-heroTags"><span>Можно без партнёра</span><span>Черновики сохраняются</span></div></div>
      {!embedded && <div className="aw-heroArt" aria-hidden="true"><span className="aw-artBack" /><span className="aw-artFront"><span>для себя</span><b>↗</b><i /><i /><i /></span><span className="aw-artSeal">✦</span></div>}
    </header>
    <nav className="aw-relatedNav" aria-label="Анкеты и отношения"><Link href="/assessments/conditions">Мои условия <span aria-hidden="true">↗</span></Link><Link href="/assessments/discovery">Знакомства по условиям <span aria-hidden="true">↗</span></Link><Link href="/assessments/pair">Договорённости пары <span aria-hidden="true">↗</span></Link><Link href="/profile/settings#assessment-settings">Мои данные <span aria-hidden="true">↗</span></Link></nav>
    {resource.error && <div className={`app-panel aw-message`} role="alert"><p>{resource.error}</p><button className="app-btn-secondary" onClick={() => void resource.reload()} disabled={resource.busy}>Повторить загрузку</button></div>}
    {resource.saved && <p className="aw-message" role="status">Выбор сохранён на сервере.</p>}
    {!resource.data && !resource.error && <p className="aw-message" role="status">Загружаем доступные вам темы…</p>}
    {resource.data && (resource.data.portfolio ? <Portfolio key={resource.ownerId} portfolio={resource.data.portfolio} busy={resource.busy} send={send} /> : <section className={`app-panel aw-setup`}>
      <h2 className="text-xl font-semibold">{setupAvailable ? 'Начните с настройки анкет' : 'Настройки анкет'}</h2>
      <p>{settings?.mode === 'OFF' ? 'Анкеты временно отключены в настройках приложения. Сохранённые данные остаются доступны в вашем аккаунте.' : setupAvailable ? 'Перед первой анкетой один раз прочитайте условия и выберите использование своих данных. После сохранения откроются темы и формы.' : settings?.admission === 'ACTIVE' ? 'Вы отключили сохранение ответов и личные расчёты. Включите их в настройках, чтобы продолжить анкеты.' : 'Сейчас анкеты недоступны этому аккаунту. Сохранёнными данными можно управлять в настройках.'}</p>
      {setupAvailable && settings?.mode !== 'OFF' && <Link className="app-btn-primary inline-flex" href="/assessments/start">Настроить и открыть анкеты</Link>}
      <Link className="block underline" href="/profile/settings#assessment-settings">Управлять своими данными</Link>
    </section>)}
  </Container>;
}
