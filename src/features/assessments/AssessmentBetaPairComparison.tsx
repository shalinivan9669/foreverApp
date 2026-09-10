'use client';
import { useCallback, useState } from 'react';
import { assessmentBetaApi } from '@/client/api/assessmentBeta';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import type { BetaComparisonMutation } from '@/lib/dto/assessmentBeta.dto';
import { ComparisonResult } from './AssessmentBetaComparisonResult';

type Actions = NonNullable<BetaComparisonMutation['actionIds']>;
/** The endpoint derives the actual Pair and both actors from the current session. */
export default function AssessmentBetaPairComparison() {
  const [selected, setSelected] = useState<Actions>([]), [submitted, setSubmitted] = useState<Actions>([]);
  const read = useCallback((signal: AbortSignal) => assessmentBetaApi.compare({ actionIds: submitted }, signal), [submitted]);
  const resource = useAssessmentResource(read), comparison = resource.data;
  return <section className="space-y-4" aria-label="Текущие и условные условия пары">
    {resource.error && <div role="alert"><p>{resource.error}</p><button className="app-btn-secondary" disabled={resource.busy} onClick={() => void resource.reload()}>Повторить текущую проверку</button></div>}
    {!comparison && !resource.error && <p role="status">Проверяем текущие условия действующей пары…</p>}
    {comparison && <div key={resource.ownerId} className="space-y-4"><section className="app-panel p-4 space-y-3"><h2 className="text-xl font-semibold">Текущие заявленные условия</h2><p>Первый участник в этом расчёте — вы. Условия обоих и ресурс одного общего плана проверяются отдельно.</p>{comparison.current ? <ComparisonResult result={comparison.current} /> : <p>Сейчас сравнение недоступно по текущим условиям и разрешениям.</p>}</section>
      {comparison.availability === 'AVAILABLE' && <form className="app-panel-soft p-4 space-y-3" onSubmit={event => { event.preventDefault(); setSubmitted([...selected]); }}>
        <h2 className="text-xl font-semibold">Выбрать отдельные условные действия</h2><p>Отмечается только набор для проверки. Это не согласие другого человека, новая способность или изменение ваших условий.</p>
        <fieldset disabled={resource.busy}><legend className="font-medium">Опубликованные варианты для текущего контекста</legend>{comparison.availableActions.length === 0 && <p>Сейчас нет допустимого условного действия. Неизвестный навык не требует обучения.</p>}{comparison.availableActions.map(action => <label key={action.id} className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" checked={selected.includes(action.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, action.id] : previous.filter(id => id !== action.id))} /><span>{action.label}<span className="block app-muted text-sm">{action.verification} {action.requiresChoice ? 'Готовность ещё не выбрана.' : 'Открытость к проверке не означает договорённость.'}</span></span></label>)}</fieldset>
        <button className="app-btn-secondary" disabled={resource.busy || selected.length === 0}>Рассчитать выбранный условный набор</button>
      </form>}
      <section className="space-y-3" aria-label="Условный результат пары"><h2 className="text-xl font-semibold">Отдельные условные варианты</h2><p>Только явно проверенные предпосылки. Текущий профиль не изменяется. Договорённость ниже требует собственного содержания и двух отдельных подтверждений.</p>
        {comparison.scenarios.length === 0 ? <p>В пределах рассмотренного набора подходящий условный вариант не найден. Это не общая невозможность.</p> : comparison.scenarios.map((scenario, index) => <article className="app-panel-soft p-4 space-y-3" key={scenario.actionIds.join(':')}><h3 className="font-semibold">Вариант {index + 1}: только при выполнении предпосылок</h3><ComparisonResult result={scenario.result} /><ul className="list-disc pl-5">{scenario.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul><p>Ваш дополнительный ресурс: {scenario.ownAttemptMinutes} минут. {scenario.voluntaryState === 'MODEL_OPTION_NOT_CHOSEN' ? 'Чья-то готовность остаётся неизвестной.' : 'Заявленная открытость ещё не подтверждает договорённость.'}</p></article>)}
      </section>
    </div>}
  </section>;
}
