'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import { assessmentApi } from '@/client/api/assessment';
import AssessmentBetaPairComparison from './AssessmentBetaPairComparison';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import { confirmAppNavigation, useUnsavedChanges } from '@/client/hooks/useUnsavedChanges';
import { betaAgreementSchema, betaReminderSettingsSchema, type AssessmentPairDTO, type AssessmentPairMutation, type BetaAgreement } from '@/lib/dto/assessmentPair.dto';
import { expandBetaRecurrence } from '@/lib/dto/assessmentClient.dto';
import { ReportForm } from './AssessmentPairPanel';

type Command<T = AssessmentPairMutation> = T extends AssessmentPairMutation ? Omit<T, 'expectedRevision' | 'idempotencyKey' | 'context'> : never;
type Send = (command: Command) => Promise<boolean>;
type Role = 'A' | 'B';
type ActionDraft = Omit<BetaAgreement['actions'][number], 'resourceMinutes' | 'noticeRole' | 'planningRole' | 'reminderRole' | 'verificationRole'> & {
  resourceMinutes: string; noticeRole: Role | ''; planningRole: Role | ''; reminderRole: Role | ''; verificationRole: Role | '';
};
const read = async (signal: AbortSignal) => {
  const pair = await assessmentApi.pair(signal);
  return { pair, readAt: Date.now() };
};
type Data = Awaited<ReturnType<typeof read>>;
const weekdays = [{ id: 1, title: 'Понедельник' }, { id: 2, title: 'Вторник' }, { id: 3, title: 'Среда' }, { id: 4, title: 'Четверг' }, { id: 5, title: 'Пятница' }, { id: 6, title: 'Суббота' }, { id: 0, title: 'Воскресенье' }];
const roleLabel = (role: Role, mine: Role | null) => `Участник ${role}${role === mine ? ' (вы)' : ''}`;
const formatTime = (instant: string, timezone: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant));

const reportLabel = { NEEDS_CHANGE: 'Хочу изменить договорённость', ACCEPTABLE: 'Приемлемо', GOOD: 'Подходит хорошо' };
function RoleSelect({ label, value, mine, change }: { label: string; value: Role | ''; mine: Role | null; change: (role: Role | '') => void }) {
  return <label className="block">{label}<select className="app-input block w-full mt-1" required value={value} onChange={event => change(event.target.value === 'A' || event.target.value === 'B' ? event.target.value : '')}><option value="">Выберите участника</option>{(['A', 'B'] as const).map(role => <option key={role} value={role}>{roleLabel(role, mine)}</option>)}</select></label>;
}
function Proposal({ pair, busy, send }: { pair: AssessmentPairDTO; busy: boolean; send: Send }) {
  const previous = pair.agreement?.betaAgreement;
  const [templateId, setTemplateId] = useState<'DOM.S07' | 'COM.S04'>(previous?.templateId ?? 'DOM.S07');
  const [title, setTitle] = useState(previous?.title ?? ''), [criterion, setCriterion] = useState(previous?.completionCriterion ?? '');
  const [timezone, setTimezone] = useState(previous?.schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [startsOn, setStartsOn] = useState(previous?.schedule.startsOn ?? ''), [endsBefore, setEndsBefore] = useState(previous?.schedule.endsBefore ?? '');
  const [localTime, setLocalTime] = useState(previous?.schedule.localTime ?? ''), [duration, setDuration] = useState(previous ? String(previous.schedule.durationMinutes) : '');
  const [days, setDays] = useState(previous?.schedule.weekdays ?? []);
  const [actions, setActions] = useState<ActionDraft[]>(previous ? previous.actions.map(action => ({ ...action, resourceMinutes: String(action.resourceMinutes) })) : (['A', 'B'] as const).map(role => ({ role, task: '', criterion: '', resourceMinutes: '', noticeRole: '', planningRole: '', reminderRole: '', verificationRole: '' })));
  const [dirty, setDirty] = useState(false), [error, setError] = useState<string | null>(null);
  useUnsavedChanges(dirty, busy);
  const updateAction = (index: number, patch: Partial<ActionDraft>) => { setActions(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); setDirty(true); };
  const submit = () => {
    setError(null);
    if (!duration || actions.some(action => action.resourceMinutes === '')) { setError('Укажите длительность и ресурс каждого действия. Значения заранее не выбраны.'); return; }
    const parsed = betaAgreementSchema.safeParse({ templateId, title, actions: actions.map(action => ({ ...action, resourceMinutes: Number(action.resourceMinutes) })), schedule: { timezone, startsOn, endsBefore, weekdays: days, localTime, durationMinutes: Number(duration), ambiguousTimePolicy: 'REJECT', nonexistentTimePolicy: 'REJECT' }, completionCriterion: criterion, reschedulePolicy: 'RECONFIRM_FUTURE', endPolicy: 'EITHER_CAN_STOP' });
    if (!parsed.success) { setError('Проверьте все действия, распределение работ и конечное расписание до 56 дней.'); return; }
    try {
      const occurrences = expandBetaRecurrence(parsed.data.schedule);
      if (occurrences.some(value => Date.parse(value.startsAt) <= Date.now())) { setError('Новая редакция задаёт будущие повторения. Уже прошедшее сохраняется в прежней версии.'); return; }
    } catch { setError('В этом расписании есть отсутствующее или неоднозначное местное время. Выберите другое время или уточните часовой пояс.'); return; }
    void send({ action: pair.agreement ? 'revise' : 'propose', scenarioId: null, betaAgreement: parsed.data }).then(ok => { if (ok) setDirty(false); });
  };
  return <details className="app-panel p-4" open={!pair.agreement}><summary className="text-lg font-semibold min-h-11 cursor-pointer">{pair.agreement ? 'Подготовить новую редакцию' : 'Составить конкретное предложение'}</summary>
    <form className="mt-4 space-y-5" onSubmit={event => { event.preventDefault(); submit(); }}><fieldset disabled={busy} className="space-y-4"><legend className="font-semibold">Содержание и участие</legend>
      <p>Каждый решает за себя. Это предложение ещё не означает согласия второго человека или изменения навыка. Не требуется общий быт: можно согласовать способ разговора.</p>
      <label className="block">Тип договорённости<select className="app-input block w-full" value={templateId} onChange={event => { if (event.target.value === 'DOM.S07' || event.target.value === 'COM.S04') setTemplateId(event.target.value); setDirty(true); }}><option value="DOM.S07">Бытовая задача</option><option value="COM.S04">Пауза и возврат к разговору</option></select></label>
      <label className="block">Название<input className="app-input block w-full" required maxLength={120} value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} /></label>
      {actions.map((action, index) => <fieldset className="app-panel-soft p-4 space-y-3" key={index}><legend className="font-semibold">Действие {index + 1}: {roleLabel(action.role, pair.myRole)}</legend>
        <RoleSelect label="Кто выполняет это действие" value={action.role} mine={pair.myRole} change={role => { if (role) updateAction(index, { role }); }} />
        <label className="block">Конкретное действие<textarea className="app-input block w-full" required maxLength={300} value={action.task} onChange={event => updateAction(index, { task: event.target.value })} /></label>
        <label className="block">Как можно проверить его завершение<textarea className="app-input block w-full" required maxLength={300} value={action.criterion} onChange={event => updateAction(index, { criterion: event.target.value })} /></label>
        <label className="block">Все затраты на это действие за одно повторение, минуты<input className="app-input block w-full" required type="number" min={0} max={1440} step={1} value={action.resourceMinutes} onChange={event => updateAction(index, { resourceMinutes: event.target.value })} /><span className="app-muted text-sm">Включите замечание, планирование, напоминания и проверку один раз. Дополнительная работа не назначается автоматически.</span></label>
        <div className="grid sm:grid-cols-2 gap-3"><RoleSelect label="Кто замечает необходимость" value={action.noticeRole} mine={pair.myRole} change={role => updateAction(index, { noticeRole: role })} /><RoleSelect label="Кто планирует" value={action.planningRole} mine={pair.myRole} change={role => updateAction(index, { planningRole: role })} /><RoleSelect label="Кто отвечает за напоминание" value={action.reminderRole} mine={pair.myRole} change={role => updateAction(index, { reminderRole: role })} /><RoleSelect label="Кто проверяет окончание" value={action.verificationRole} mine={pair.myRole} change={role => updateAction(index, { verificationRole: role })} /></div>
        {actions.length > 2 && <button className="app-btn-secondary" type="button" onClick={() => { setActions(rows => rows.filter((_, row) => row !== index)); setDirty(true); }}>Убрать действие {index + 1}</button>}
      </fieldset>)}
      <button className="app-btn-secondary" type="button" disabled={actions.length >= 8} onClick={() => { setActions(rows => [...rows, { role: pair.myRole ?? 'A', task: '', criterion: '', resourceMinutes: '', noticeRole: '', planningRole: '', reminderRole: '', verificationRole: '' }]); setDirty(true); }}>Добавить действие</button>
      <label className="block">Общее правило проверки результата<textarea className="app-input block w-full" required maxLength={500} value={criterion} onChange={event => { setCriterion(event.target.value); setDirty(true); }} /></label>
    </fieldset>
    <fieldset disabled={busy} className="app-panel-soft p-4 space-y-3"><legend className="font-semibold">Конечное расписание</legend><label className="block">Часовой пояс IANA<input className="app-input block w-full" required value={timezone} onChange={event => { setTimezone(event.target.value); setDirty(true); }} /></label>
      <div className="grid sm:grid-cols-2 gap-3"><label>Первый день<input className="app-input block w-full" required type="date" value={startsOn} onChange={event => { setStartsOn(event.target.value); setDirty(true); }} /></label><label>До даты (этот день не включён)<input className="app-input block w-full" required type="date" value={endsBefore} onChange={event => { setEndsBefore(event.target.value); setDirty(true); }} /></label></div>
      <fieldset><legend>Дни недели</legend><div className="grid sm:grid-cols-2 gap-1">{weekdays.map(day => <label key={day.id} className="flex items-center gap-3 min-h-11"><input type="checkbox" checked={days.includes(day.id)} onChange={event => { setDays(values => event.target.checked ? [...values, day.id] : values.filter(value => value !== day.id)); setDirty(true); }} />{day.title}</label>)}</div></fieldset>
      <div className="grid sm:grid-cols-2 gap-3"><label>Местное время начала<input className="app-input block w-full" required type="time" value={localTime} onChange={event => { setLocalTime(event.target.value); setDirty(true); }} /></label><label>Длительность одного повторения, минуты<input className="app-input block w-full" required type="number" min={1} max={1440} step={1} value={duration} onChange={event => { setDuration(event.target.value); setDirty(true); }} /></label></div>
      <p className="app-muted text-sm">Период до 56 дней. Неоднозначное время при смене часового пояса требует уточнения. Перенос будущего — новая редакция и два новых подтверждения; прошлые записи сохраняются.</p>
    </fieldset>
    <p>Каждый может прекратить участие. Пропущенный срок без ответа означает неизвестность, а не установленное нарушение. Отдельный отзыв можно сохранить лично.</p>
    {error && <p role="alert">{error}</p>}<p role="status">{dirty ? 'Предложение ещё не сохранено.' : 'Показаны исходные поля предложения.'}</p><button className="app-btn-primary" disabled={busy}>{busy ? 'Сохраняем…' : pair.agreement ? 'Предложить эту новую редакцию' : 'Сохранить предложение для двух подтверждений'}</button>
    </form>
  </details>;
}
function OwnControls({ pair, busy, send }: { pair: AssessmentPairDTO; busy: boolean; send: Send }) {
  const [note, setNote] = useState(pair.ownNote ?? ''), [noteDirty, setNoteDirty] = useState(false), [reminderDirty, setReminderDirty] = useState(false);
  const settings = pair.reminders;
  const [enabled, setEnabled] = useState(settings?.enabled ?? false), [timezone, setTimezone] = useState(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [quietStart, setQuietStart] = useState(settings ? String(settings.quietStartHour) : ''), [quietEnd, setQuietEnd] = useState(settings ? String(settings.quietEndHour) : ''), [lead, setLead] = useState(settings ? String(settings.leadMinutes) : '');
  const [error, setError] = useState<string | null>(null);
  useUnsavedChanges(noteDirty || reminderDirty, busy);
  return <section className="app-panel p-4 space-y-5"><h2 className="text-xl font-semibold">Только мои настройки</h2>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void send({ action: 'own-note', note }).then(ok => { if (ok) setNoteDirty(false); }); }}><label className="block">Моя личная заметка<textarea className="app-input block w-full" disabled={busy} maxLength={1000} value={note} onChange={event => { setNote(event.target.value); setNoteDirty(true); }} /></label><p className="app-muted">Заметка доступна только вам и не меняет содержание или подписи общей договорённости.</p><button className="app-btn-secondary" disabled={busy}>Сохранить только мою заметку</button></form>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); setError(null);
      const parsed = betaReminderSettingsSchema.safeParse({ enabled, timezone, quietStartHour: Number(quietStart), quietEndHour: Number(quietEnd), leadMinutes: Number(lead) });
      if (!parsed.success || (enabled && (!quietStart || !quietEnd || !lead))) { setError('Укажите часовой пояс, оба часа тишины и время напоминания; 0 допустим как явно введённое значение.'); return; }
      void send({ action: 'reminders', settings: parsed.data }).then(ok => { if (ok) setReminderDirty(false); });
    }}><fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">Мои напоминания в приложении</legend><label className="min-h-11 flex items-center gap-3"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setReminderDirty(true); }} />Хочу получать напоминания во входящих приложения</label>
      {enabled && <><label className="block">Часовой пояс<input className="app-input block w-full" required value={timezone} onChange={event => { setTimezone(event.target.value); setReminderDirty(true); }} /></label><div className="grid sm:grid-cols-2 gap-3"><label>Начало тишины, час 0–23<input className="app-input block w-full" required type="number" min={0} max={23} step={1} value={quietStart} onChange={event => { setQuietStart(event.target.value); setReminderDirty(true); }} /></label><label>Конец тишины, час 0–23<input className="app-input block w-full" required type="number" min={0} max={23} step={1} value={quietEnd} onChange={event => { setQuietEnd(event.target.value); setReminderDirty(true); }} /></label></div><p className="app-muted text-sm">Одинаковые часы означают, что период тишины не задан.</p><label className="block">За сколько минут напоминать<input className="app-input block w-full" required type="number" min={0} max={1440} step={1} value={lead} onChange={event => { setLead(event.target.value); setReminderDirty(true); }} /></label></>}
    </fieldset><p>Заголовок не содержит тему или ваши ответы. Можно отключить в любой момент; внешние сообщения этим выбором не включаются.</p>{error && <p role="alert">{error}</p>}<button className="app-btn-secondary" disabled={busy}>Сохранить мои напоминания</button></form>
  </section>;
}
function Workspace({ data, busy, send, reload }: { data: Data; busy: boolean; send: Send; reload: () => Promise<void> }) {
  const { pair } = data;
  const [confirmation, setConfirmation] = useState<number | null>(null), [periodId, setPeriodId] = useState('');
  const agreement = pair.agreement;
  const ownConfirmed = agreement && pair.myRole ? agreement.confirmations[pair.myRole] : false;
  const selectedPeriod = pair.periods.find(period => period.id === periodId);
  return <>
    {pair.availability !== 'AVAILABLE' ? <section className="app-panel p-4 space-y-3"><h2 className="font-semibold">Совместный контекст пока недоступен</h2><p>Создайте действующую пару и сохраните свои условия. Для общего сравнения оба участника включают его в настройках данных. Прежняя пара и отозванные разрешения не используются автоматически.</p><Link className="app-btn-secondary inline-flex" href="/pair">Проверить состояние пары</Link><Link className="app-btn-secondary inline-flex" href="/assessments/conditions">Мои условия</Link><Link className="block underline" href="/profile/settings#assessment-settings">Настройки и управление данными</Link></section> : <>
      <p className="app-panel-soft p-3">В этой паре вы — участник {pair.myRole}. Буква обозначает участника, а не роль в быту или разговоре.</p>
      <AssessmentBetaPairComparison key={`${pair.context?.pairId}:${pair.revision}`} />
      <Proposal key={agreement?.contentRevision ?? 'new'} pair={pair} busy={busy} send={send} />
      {agreement && <article className="app-panel p-4 space-y-4"><h2 className="text-xl font-semibold">{agreement.title} · редакция {agreement.contentRevision}</h2><p className="whitespace-pre-wrap">{agreement.content}</p>
        {agreement.betaAgreement && <><p>Расписание: {agreement.betaAgreement.schedule.startsOn} — {agreement.betaAgreement.schedule.endsBefore} (последний день не включён), {agreement.betaAgreement.schedule.localTime}, {agreement.betaAgreement.schedule.timezone}. Повторение длится {agreement.betaAgreement.schedule.durationMinutes} минут.</p><ul className="list-disc pl-5">{agreement.betaAgreement.actions.map((action, index) => <li key={index}>{roleLabel(action.role, pair.myRole)}: {action.task}. Замечает: {action.noticeRole}; планирует: {action.planningRole}; напоминает: {action.reminderRole}; проверяет: {action.verificationRole}. Указанный ресурс: {action.resourceMinutes} минут.</li>)}</ul></>}
        <p role="status">{agreement.status === 'ACTIVE' ? 'Оба участника подтвердили именно эту редакцию.' : agreement.status === 'REVOKED' ? 'Участие прекращено.' : 'Нужны два отдельных подтверждения одного содержания.'}</p><dl className="flex flex-wrap gap-5">{(['A', 'B'] as const).map(role => <div key={role}><dt>{roleLabel(role, pair.myRole)}</dt><dd>{agreement.confirmations[role] ? 'Подтверждение есть' : 'Подтверждения нет'}</dd></div>)}</dl>
        {!ownConfirmed && agreement.status !== 'REVOKED' && <><label className="flex min-h-11 items-start gap-3"><input type="checkbox" disabled={busy} checked={confirmation === agreement.contentRevision} onChange={event => setConfirmation(event.target.checked ? agreement.contentRevision : null)} /><span>Я прочитал эту редакцию и добровольно подтверждаю только своё участие.</span></label><button className="app-btn-primary" disabled={busy || confirmation !== agreement.contentRevision} onClick={() => void send({ action: 'confirm', expectedContentRevision: agreement.contentRevision })}>Подтвердить моё участие</button></>}
        <div className="flex flex-wrap gap-3"><button className="app-btn-secondary" disabled={busy} onClick={() => { if (confirmAppNavigation()) void reload(); }}>Проверить сохранённое состояние</button>{agreement.status !== 'REVOKED' && <button className="app-btn-secondary" disabled={busy} onClick={() => void send({ action: 'revoke' })}>Прекратить моё участие</button>}</div><p className="app-muted">Подписи не повышают навык. Можно выйти без штрафного показателя или обязанности уступить.</p>
      </article>}
      {agreement?.betaAgreement && <OwnControls key={`${pair.context?.pairId}:own-controls`} pair={pair} busy={busy} send={send} />}
      {(pair.occurrences?.length ?? 0) > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">Конкретные повторения</h2><ul className="space-y-3">{pair.occurrences!.map(occurrence => <li key={occurrence.id} className="app-panel-soft p-3"><p>{occurrence.title} · редакция {occurrence.contentRevision}</p><p>{formatTime(occurrence.startsAt, occurrence.timezone)} — {formatTime(occurrence.endsAt, occurrence.timezone)}</p><p>{occurrence.state === 'CANCELLED' ? 'Отменено при пересмотре или прекращении участия.' : occurrence.state === 'ELAPSED_UNKNOWN' ? 'Время прошло. Без отдельного наблюдения результат неизвестен.' : 'Будущее согласованное повторение.'}</p></li>)}</ul></section>}
      {agreement?.status === 'ACTIVE' && <section className="space-y-3"><h2 className="text-xl font-semibold">Мой отдельный отчёт</h2><p>Можно указать своё мнение лично. Не требуется положительный отзыв второго участника.</p><label className="block">Выберите прошедшее или начавшееся повторение<select className="app-input block w-full" value={periodId} disabled={busy} onChange={event => { if (confirmAppNavigation()) setPeriodId(event.target.value); }}><option value="">Период не выбран</option>{pair.periods.filter(period => Date.parse(period.window.start) <= data.readAt).map(period => <option key={period.id} value={period.id}>{period.label}</option>)}</select></label>{selectedPeriod && <ReportForm subject="AGREEMENT" key={`${periodId}:${pair.revision}`} busy={busy} previous={pair.reports.find(report => report.periodId === periodId)} save={(category, shared) => send({ action: 'report', periodId, category, shared })} />}</section>}
      {pair.reports.filter(report => report.ownRecorded || report.A !== null || report.B !== null).map(report => <article key={report.periodId} className="app-panel p-4 space-y-3"><h3 className="font-semibold">{pair.periods.find(period => period.id === report.periodId)?.label ?? 'Отдельное наблюдение'}</h3><p>Ваш взгляд: {report.own ? reportLabel[report.own] : 'Пока неизвестно'}. {report.ownShared ? 'Разрешён для общего вида.' : 'Личный отчёт.'}</p><p>Общий вид A: {report.A ? reportLabel[report.A] : 'Нет доступного значения'}.</p><p>Общий вид B: {report.B ? reportLabel[report.B] : 'Нет доступного значения'}.</p><p>{report.status === 'SHARED_DATA_INCOMPLETE' ? 'Общих данных недостаточно; закрытое направление не раскрывается.' : report.status === 'AT_LEAST_ONE_REQUESTS_CHANGE' ? 'Как минимум один участник просит пересмотр. Другое мнение не отменяет этой просьбы.' : report.status === 'DIFFERENT_REPORTED_CATEGORIES' ? 'Два разных мнения сохранены отдельно.' : report.status === 'INCOMPARABLE' ? 'Эти наблюдения несопоставимы.' : 'Сообщены одинаковые категории в этом периоде.'}</p><p className="app-muted">Динамика вашего отдельного отчёта: {report.ownTrend === 'IMPROVED_REPORTED_CATEGORY' ? 'более приемлемая категория' : report.ownTrend === 'LOWER_REPORTED_CATEGORY' ? 'менее приемлемая категория' : report.ownTrend === 'SAME_REPORTED_CATEGORY' ? 'категория не изменилась' : report.ownTrend === 'INCOMPARABLE' ? 'периоды несопоставимы' : 'пока неизвестна'}. Это описание ваших ответов, а не доказательство роста навыка или эффекта договорённости.</p>{report.ownShared && <button className="app-btn-secondary" disabled={busy} onClick={() => void send({ action: 'revoke-report', periodId: report.periodId })}>Сделать мой отчёт личным</button>}</article>)}
      {agreement?.status === 'ACTIVE' && <section className="app-panel-soft p-4 space-y-3"><h2 className="text-xl font-semibold">Вернуться к отдельному наблюдению</h2><p>Новое применение описывается в самостоятельной анкете с завершившимся периодом. Договорённость и отчёт сами по себе не становятся измерением навыка.</p><Link className="app-btn-secondary inline-flex" href={`/assessments/forms/${agreement.betaAgreement?.templateId === 'COM.S04' ? 'com-s04-application-beta' : 'dom-s07-application-beta'}`}>Открыть свои наблюдения</Link><button className="app-btn-secondary" disabled={busy} onClick={() => void send({ action: 'observe' })}>Начать следующую завершённую волну наблюдений</button></section>}
    </>}
  </>;
}
export default function AssessmentBetaPairPage() {
  const resource = useAssessmentResource(read), receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const send: Send = command => {
    const fingerprint = JSON.stringify({ owner: resource.ownerId, command });
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, key: crypto.randomUUID() };
    return resource.run(async (current, signal) => { if (!current.pair.context) return; await assessmentApi.mutatePair({ ...command, context: current.pair.context, expectedRevision: current.pair.revision, idempotencyKey: receipt.current!.key }, signal); }).then(ok => { if (ok) receipt.current = null; return ok; });
  };
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Договорённости пары" fallbackHref="/questionnaires" /><h1 className="text-2xl font-semibold">Договорённости пары</h1><p>Согласуйте конкретное действие, время и распределение работ. Каждый сохраняет право на отдельный взгляд, пересмотр и выход.</p><nav className="flex flex-wrap gap-3" aria-label="Условия и наблюдения"><Link className="app-btn-secondary" href="/assessments/conditions">Мои условия и ресурс</Link><Link className="app-btn-secondary" href="/questionnaires">Анкеты и навыки</Link></nav>
    {resource.error && <div role="alert" className="app-panel p-4 space-y-3"><p>{resource.error}</p><button className="app-btn-secondary" disabled={resource.busy} onClick={() => { if (confirmAppNavigation()) void resource.reload(); }}>Обновить сохранённое состояние</button><Link className="block underline" href="/profile/settings#assessment-settings">Управление моими данными</Link></div>}{resource.saved && <p role="status">Изменение сохранено и повторно проверено сервером.</p>}{!resource.data && !resource.error && <p role="status">Проверяем текущую пару и ваши разрешения…</p>}{resource.data && <Workspace key={resource.ownerId} data={resource.data} busy={resource.busy} send={send} reload={resource.reload} />}
  </main>;
}
