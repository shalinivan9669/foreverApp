'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { measurementsApi } from '@/client/api/measurements.api';
import { useMeasurement } from '@/client/hooks/useMeasurements';
import type { MeasurementTestDTO, MeasurementAnswerDTO } from '@/lib/dto/measurementTests.dto';
import type { MeasuredPairProfileDTO } from '@/lib/dto/measuredPairProfile.dto';
import BackBar from '@/components/ui/BackBar';
import { FactorCard } from '@/components/profile/ModeAwareProfileOverview';

export function MeasurementCatalog() {
  const [rows, setRows] = useState<MeasurementTestDTO[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const controller = new AbortController(); void measurementsApi.list(controller.signal).then((result) => { if (!controller.signal.aborted) { setRows(result); setError(false); } }).catch(() => { if (!controller.signal.aborted) { setRows([]); setError(true); } }); const refresh = () => { if (document.visibilityState === 'visible') setAttempt((value) => value + 1); }; window.addEventListener('focus', refresh); window.addEventListener('storage', refresh); return () => { controller.abort(); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); }; }, [attempt]);
  return <section className="app-page-stack"><h2 className="text-xl font-semibold">Личные характеристики: шесть областей</h2><p className="app-muted app-reading-width leading-relaxed">Авторские анкеты самоотчёта. Каждый тест проходит один раз; сохранённый результат остаётся доступен. Личные анкеты доступны без пары.</p>
    {error && <p role="alert">Каталог не загрузился. <button className="app-btn-secondary" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Повторить</button></p>}
    {!rows.length && !error && <p role="status">Загружаем анкеты…</p>}
    <div className="app-collection-grid">{rows.map((row) => <article className="app-measurement-catalog-card" key={row.test.key}><p className="app-muted text-sm">{row.test.area}</p><h3 className="font-semibold">{row.test.title}</h3><p>{row.test.purpose}</p><p className="text-sm font-semibold">{row.status === 'FINALIZED' ? 'Пройден' : row.status === 'DRAFT' ? 'Есть черновик' : 'Ещё не пройден'}</p><Link className="app-btn-primary inline-flex" href={`/measurements/${row.test.key}`}>{row.status === 'FINALIZED' ? 'Посмотреть результат' : row.status === 'DRAFT' ? 'Продолжить' : 'Открыть анкету'}</Link></article>)}</div>
  </section>;
}

function MeasurementForm({ data, busy, onSave }: { data: MeasurementTestDTO; busy: boolean; onSave: (answers: MeasurementAnswerDTO[], pairUse: boolean, final: boolean) => void }) {
  const [answers, setAnswers] = useState<MeasurementAnswerDTO[]>(data.answers);
  const [pairUse, setPairUse] = useState(data.pairUse);
  const [confirmed, setConfirmed] = useState(false);
  const complete = data.test.questions.every((question) => answers.some((answer) => answer.questionId === question.id && (!question.required || answer.choice !== null)));
  const answeredCount = data.test.questions.filter((question) => answers.some((answer) => answer.questionId === question.id && (!question.required || answer.choice !== null))).length;

  return (
    <form className="app-measurement-form" onSubmit={(event) => { event.preventDefault(); if (confirmed && complete) onSave(answers, pairUse, true); }}>
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">Ваш прогресс</span>
          <span className="app-muted">{answeredCount} из {data.test.questions.length}</span>
        </div>
        <progress className="app-question-progress" value={answeredCount} max={data.test.questions.length} aria-label="Ответы и явные пропуски" />
      </div>
      {data.test.questions.map((question, index) => (
        <div className="app-question-card" key={question.id}>
          <fieldset disabled={busy} className="app-measurement-fieldset">
            <legend className="app-measurement-legend">
              <span className="app-measurement-number">{index + 1}</span>{question.text}
              <span className="app-measurement-required">{question.required ? 'Обязательный вопрос' : 'Можно пропустить'}</span>
            </legend>
            <div className="app-measurement-choices">
              {[...question.choices.map((label, choice) => ({ label, value: choice + 1 as number | null })), ...(!question.required ? [{ label: 'Пропустить: подходящего опыта нет или не хочу отвечать', value: null }] : [])].map((option) => {
                const selected = answers.some((answer) => answer.questionId === question.id && answer.choice === option.value);
                return (
                  <label key={String(option.value)} className="app-measurement-choice" data-selected={selected}>
                    <input type="radio" name={question.id} checked={selected} onChange={() => { setAnswers((previous) => [...previous.filter((answer) => answer.questionId !== question.id), { questionId: question.id, choice: option.value }]); setConfirmed(false); }} />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      ))}
      <section className="app-measurement-finish" aria-labelledby="measurement-finish-title">
        <h2 id="measurement-finish-title" className="text-xl font-semibold">Сохранение анкеты</h2>
        <label className="app-measurement-consent"><input type="checkbox" checked={pairUse} disabled={busy} onChange={(event) => setPairUse(event.target.checked)} /><span>Разрешаю использовать результат для общих выводов моей пары. Сырые ответы партнёру не показываются. Разрешение можно изменить отдельно.</span></label>
        <label className="app-measurement-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>Понимаю, что окончательная отправка, включая пропуски, закрывает тест для редактирования и повторной сдачи.</span></label>
        {!complete && <p className="app-muted text-sm">Ответьте на обязательные вопросы; для остальных выберите ответ или явный пропуск.</p>}
        <div className="app-measurement-actions"><button type="button" className="app-btn-secondary" disabled={busy} onClick={() => onSave(answers, pairUse, false)}>Сохранить черновик</button><button className="app-btn-primary" disabled={busy || !complete || !confirmed}>{busy ? 'Сохраняем и рассчитываем…' : 'Окончательно отправить'}</button></div>
      </section>
    </form>
  );
}

export function MeasurementPage({ testKey }: { testKey: string }) {
  const { data, profile, error, busy, mutate, reload } = useMeasurement(testKey);
  return <main className="app-shell-dashboard app-question-shell space-y-6 py-4"><BackBar title={data?.test.title ?? 'Личная анкета'} fallbackHref="/measurements" />
    {error && <div role="alert" className="app-panel p-4 space-y-3"><p>{error}</p><button className="app-btn-secondary" onClick={() => void reload()}>Обновить и восстановить результат</button></div>}
    {!data && !error && <p role="status">Загружаем анкету…</p>}
    {data && <><header className="app-question-intro space-y-3"><p className="app-muted text-sm">{data.test.area}</p><h1 className="app-page-title font-semibold">{data.test.title}</h1><p>{data.test.purpose}</p><p className="app-muted text-sm">Результат всегда доступен вам. {data.test.matching ? 'Для знакомств он используется только с отдельным разрешением в настройках знакомств.' : 'В поиск знакомств эти ответы не попадают.'} Это авторская самооценка, не психологический диагноз.</p></header>
      {data.status === 'NEW' && <div className="app-question-card space-y-5"><p className="leading-relaxed">После окончательной отправки тест нельзя пересдать или отредактировать, даже если вы пропустили вопросы. Черновик можно продолжить.</p><button disabled={busy} className="app-btn-primary" onClick={() => void mutate({ action: 'start' })}>Начать</button></div>}
      {data.status === 'DRAFT' && <MeasurementForm key={`${testKey}:${data.revision}`} data={data} busy={busy} onSave={(answers, pairUse, final) => void mutate({ action: final ? 'finalize' : 'draft', expectedRevision: data.revision, answers, pairUse })} />}
      {data.status === 'FINALIZED' && <section className="space-y-4"><h2 className="text-xl font-semibold">{data.calculation === 'READY' ? 'Ваш результат сохранён' : 'Ответы сохранены, расчёт ещё не завершён'}</h2><p>Анкета пройдена. Ответы закрыты для редактирования и повторной сдачи.</p>
        {data.calculation !== 'READY' && <button className="app-btn-primary" disabled={busy} onClick={() => void mutate({ action: 'retry' })}>Восстановить расчёт</button>}
        {profile?.factorProfile.cards.filter((card) => data.factorKeys.includes(card.factorKey)).map((card) => <FactorCard key={card.factorKey} card={card} />)}
        {profile?.factorProfile.cards.some((card) => data.factorKeys.includes(card.factorKey) && card.status !== 'AVAILABLE') && <p>Пропуски не превращаются в средний ответ. Если для восстановления разговора пока мало наблюдений, поможет начальная самооценка или обратная связь после реальной совместной практики. Этот тест остаётся закрыт.</p>}
        <div className="app-panel p-4 space-y-3"><h3 className="font-semibold">Использование в паре</h3><p>{data.pairUse ? 'Разрешено' : 'Не разрешено'}. Собственный результат сохраняется при отзыве. Уже просмотренный общий вывод невозможно сделать непрочитанным.</p><button disabled={busy} className="app-btn-secondary" onClick={() => void mutate({ action: 'permission', pairUse: !data.pairUse, expectedPermissionRevision: data.permissionRevision })}>{data.pairUse ? 'Отозвать разрешение' : 'Разрешить общий расчёт пары'}</button></div>
        <details className="app-question-card"><summary className="min-h-11 cursor-pointer font-semibold">Мои сохранённые ответы</summary>{data.test.questions.map((question) => { const choice = data.answers.find((answer) => answer.questionId === question.id)?.choice; return <p className="app-measurement-saved-answer" key={question.id}>{question.text}<br /><strong>{choice == null ? 'Пропущено' : question.choices[choice - 1]}</strong></p>; })}</details>
        <div className="app-measurement-actions"><Link className="app-btn-primary" href="/profile">Мои характеристики</Link><Link className="app-btn-secondary" href="/measurements">Другие анкеты</Link>{data.pairUse && <Link className="app-btn-secondary" href="/pair">Актуальный результат пары</Link>}</div>
      </section>}
    </>}
  </main>;
}

export function MeasuredPairPanel({ pairId }: { pairId: string }) {
  const [data, setData] = useState<MeasuredPairProfileDTO | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void measurementsApi.pair(pairId, controller.signal).then((result) => { if (!controller.signal.aborted) { setData(result); setError(false); } }).catch(() => { if (!controller.signal.aborted) { setData(null); setError(true); } });
    const refresh = () => { if (document.visibilityState === 'visible') setAttempt((value) => value + 1); };
    window.addEventListener('focus', refresh); window.addEventListener('storage', refresh); window.addEventListener('profile-measurements-changed', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); window.removeEventListener('profile-measurements-changed', refresh); };
  }, [pairId, attempt]);
  return <section className="space-y-3"><h2 className="text-xl font-semibold">Наши договорённости и различия</h2><p className="app-muted">Общие выводы по разрешённым личным данным. Различие не означает плохого партнёра. Совместное проживание не предполагается.</p>{error && <p role="alert">Не удалось обновить общий результат. <button className="app-btn-secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></p>}
    {!data && !error && <p role="status">Обновляем общий результат…</p>}
    {data?.status === 'paused' && <p>Пара на паузе. Общие ориентиры доступны для чтения.</p>}
    {data?.cards.map((card) => <article key={card.factorKey} className="app-panel p-4 space-y-2"><h3 className="font-semibold">{card.title}</h3><p>{card.meaning}</p><p className="app-muted">{card.nextAction}</p>{card.factorKey === 'wellbeing.current.overload' && <Link className="app-btn-secondary inline-flex" href={`/pair/${encodeURIComponent(pairId)}?action=check-in#weekly-checkin`}>Состояние недели</Link>}</article>)}<Link className="app-btn-secondary inline-flex" href="/measurements">Личные анкеты и разрешения</Link>
  </section>;
}
