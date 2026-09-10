'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import LikeComposer from '@/components/matching/LikeComposer';
import { assessmentBetaApi } from '@/client/api/assessmentBeta';
import { matchApi } from '@/client/api/match.api';
import { useAssessmentResource } from '@/client/hooks/useAssessmentResource';
import type { BetaDiscoveryDTO, BetaComparisonMutation } from '@/lib/dto/assessmentBeta.dto';

import { ComparisonResult } from './AssessmentBetaComparisonResult';
export { ComparisonResult } from './AssessmentBetaComparisonResult';
type Card = BetaDiscoveryDTO['cards'][number];
function CandidateDetail({ card }: { card: Card }) {
  const read = useCallback(async (signal: AbortSignal) => {
    const [comparison, contact] = await Promise.all([assessmentBetaApi.compare({ candidateGrant: card.candidateGrant }, signal), matchApi.getCandidateCard(card.candidateId, card.candidateGrant, signal)]);
    return { comparison, contact };
  }, [card.candidateId, card.candidateGrant]);
  const resource = useAssessmentResource(read);
  return <div className="mt-4">{resource.error && <p role="alert">{resource.error}</p>}{!resource.data && <button className="app-btn-secondary" disabled={resource.busy} onClick={() => void resource.reload()}>{resource.busy ? 'Проверяем разрешения…' : 'Повторить'}</button>}
    {resource.data && <CandidateBody key={resource.ownerId} resource={resource} card={card} />}
  </div>;
}
type CandidateResource = ReturnType<typeof useAssessmentResource<{ comparison: Awaited<ReturnType<typeof assessmentBetaApi.compare>>; contact: Awaited<ReturnType<typeof matchApi.getCandidateCard>> }>>;
function CandidateBody({ resource, card }: { resource: CandidateResource; card: Card }) {
  const [actions, setActions] = useState<NonNullable<BetaComparisonMutation['actionIds']>>([]);
  const [scenarios, setScenarios] = useState<Awaited<ReturnType<typeof assessmentBetaApi.compare>> | null>(null);
  const data = resource.data!;
  return <div className="space-y-5"><section className="app-panel-soft p-4"><h3 className="text-lg font-semibold">Сейчас</h3>{data.comparison.current ? <ComparisonResult result={data.comparison.current} /> : <p>Сравнение сейчас недоступно. Проверьте собственные условия и настройки.</p>}</section>
    <form className="app-panel-soft p-4 space-y-3" onSubmit={event => {
      event.preventDefault(); let candidate: Awaited<ReturnType<typeof assessmentBetaApi.compare>> | null = null;
      void resource.run(async (_value, signal) => { candidate = await assessmentBetaApi.compare({ candidateGrant: card.candidateGrant, actionIds: actions }, signal); }).then(ok => { if (ok) setScenarios(candidate); });
    }}><h3 className="text-lg font-semibold">Что изменилось бы при определённых действиях</h3><p>Выбирайте только то, что хотите проверить. Расчёт не записывает готовность человека, не меняет его границы и не создаёт договорённость.</p>
      <fieldset disabled={resource.busy}>{data.comparison.availableActions.map(action => <label key={action.id} className="flex min-h-11 gap-3 items-start py-2"><input type="checkbox" className="mt-1" checked={actions.includes(action.id)} onChange={event => { setActions(previous => event.target.checked ? [...previous, action.id] : previous.filter(id => id !== action.id)); setScenarios(null); }} /><span>{action.label}<span className="app-muted block text-sm">{action.verification}</span></span></label>)}</fieldset>
      <button className="app-btn-secondary" disabled={resource.busy || actions.length === 0}>Рассчитать отдельный условный вариант</button>
    </form>
    {scenarios && <section aria-label="Условный результат" className="space-y-3">{scenarios.scenarios.length === 0 ? <p>В пределах выбранного набора подходящий условный вариант не найден.</p> : scenarios.scenarios.map((scenario, index) => <article className="app-panel p-4" key={index}><h3 className="font-semibold">Только если выполнены предпосылки</h3><ComparisonResult result={scenario.result} /><ul className="list-disc pl-5">{scenario.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul><p>Моя дополнительная нагрузка: {scenario.ownAttemptMinutes} минут. Текущий результат не изменён. {scenario.voluntaryState === 'MODEL_OPTION_NOT_CHOSEN' ? 'Это возможность модели, человек её не выбирал.' : 'Заявленная открытость не означает согласованную попытку.'}</p></article>)}</section>}
    <section className="app-panel-soft p-4 space-y-3"><h3 className="text-lg font-semibold">Карточка и добровольный контакт</h3><p>Участник сам решает, отвечать ли. Из сравнения не следует согласие на общение или пару.</p><h4 className="font-semibold">Для человека важно</h4><ul className="list-disc pl-5">{data.contact.card.requirements.map(text => <li key={text}>{text}</li>)}</ul>{data.contact.card.boundaries && <><h4 className="font-semibold">Личные границы</h4><ul className="list-disc pl-5">{data.contact.card.boundaries.map(text => <li key={text}>{text}</li>)}</ul></>}
      <LikeComposer card={data.contact.card} questions={data.contact.card.questions} loading={resource.busy} onSubmit={(input, idempotencyKey) => resource.run(async () => { await matchApi.createLike({ ...input, candidateId: card.candidateId, candidateGrant: card.candidateGrant }, { idempotencyKey }); })} />
      {resource.saved && <Link href="/match/inbox" className="underline">Проверить отправленный интерес и ответы</Link>}
    </section>
  </div>;
}
function FeedBody() {
  const [cursor, setCursor] = useState<string | undefined>();
  const read = useCallback((signal: AbortSignal) => assessmentBetaApi.discovery(signal, cursor), [cursor]);
  const resource = useAssessmentResource(read);
  const [selected, setSelected] = useState<string | null>(null);
  const lanes = { CURRENT_SUPPORTED: 'Текущие условия', CONDITIONAL_PATH: 'Условный путь', CLARIFY: 'Нужно уточнить', VISIBLE_DIFFERENCE: 'Видимые различия' };
  return <><p>Здесь только участники, которых можно показать по действующим настройкам поиска. Личные ответы и негативные компоненты не раскрываются. Авторские навыки не используются для скрытого общего ранга.</p>{resource.error && <p role="alert">{resource.error}</p>}
    {!resource.data && <button className="app-btn-secondary" disabled={resource.busy} onClick={() => void resource.reload()}>{resource.busy ? 'Проверяем текущий доступ…' : 'Повторить загрузку'}</button>}
    {resource.data && <section key={resource.ownerId} className="space-y-4" aria-label="Участники закрытой беты">{resource.data.cards.length === 0 ? <p role="status" className="app-panel-soft p-4">Сейчас доступных карточек нет. Это не заключение о ваших навыках или шансах на отношения.</p> : resource.data.cards.map(card => <article key={card.candidateId} className="app-panel p-4 space-y-3"><h2 className="text-xl font-semibold break-words">{card.displayName}</h2><p className="app-muted">{lanes[card.lane]}</p><ComparisonResult result={card.comparison} /><button className="app-btn-secondary" aria-expanded={selected === card.candidateId} onClick={() => setSelected(selected === card.candidateId ? null : card.candidateId)}>{selected === card.candidateId ? 'Закрыть подробности' : 'Открыть сравнение и карточку'}</button>{selected === card.candidateId && <CandidateDetail card={card} />}</article>)}</section>}
    <div className="flex flex-wrap gap-3">{resource.data?.nextCursor && <button className="app-btn-secondary" onClick={() => { setSelected(null); setCursor(resource.data!.nextCursor!); }}>Следующая страница</button>}{cursor && <button className="app-btn-secondary" onClick={() => { setSelected(null); setCursor(undefined); }}>Начать новый просмотр</button>}</div>
  </>;
}
export default function AssessmentDiscoveryPage() {
  return <main className="app-shell-narrow py-5 space-y-5"><BackBar title="Поиск в закрытой бете" fallbackHref="/assessments" /><h1 className="text-2xl font-semibold">С кем можно обсудить условия</h1><FeedBody /><nav className="flex flex-wrap gap-4"><Link className="underline" href="/assessments/conditions">Мои условия и время</Link><Link className="underline" href="/match-card/create">Моя карточка знакомства</Link><Link className="underline" href="/match/inbox">Входящие и контакты</Link><Link className="underline" href="/profile/settings#assessment-settings">Настройки поиска</Link></nav></main>;
}
