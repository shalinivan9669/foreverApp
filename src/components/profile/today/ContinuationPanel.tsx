"use client";

import Link from "next/link";
import { useDevelopment } from "@/client/hooks/useDevelopment";
import { useInbox } from "@/client/hooks/useInbox";
import { useCurrentUser } from "@/client/hooks/useCurrentUser";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { developmentRunHref, developmentRunStatus, resumableDevelopmentRuns } from "@/client/viewmodels/development.viewmodels";

function MatchingContinuations() {
  const inbox = useInbox();
  const incoming = inbox.incoming.filter((like) => like.allowedActions.includes("RESPOND"));
  const connections = inbox.connections.filter((connection) => ["ACTIVE", "PAUSED"].includes(connection.status));
  useRefreshOnReturn(async () => { await inbox.refetch(); }, !inbox.loading && !inbox.actionLoading);
  return <div className="mt-4 border-t border-black/10 pt-4">
    {incoming.length > 0 && <p className="mb-2 text-sm">Вам проявили интерес: {incoming.length}. Откройте входящие, чтобы ответить.</p>}
    {connections.slice(0, 3).map((connection) => <Link key={connection.id} href={`/match/connections/${encodeURIComponent(connection.id)}`} className="mb-2 block text-sm underline">
      {connection.participant.username}: {connection.status === "PAUSED" ? "знакомство на паузе" : connection.confirmation.state === "PENDING" ? connection.confirmation.requestedByMe ? "ожидаем подтверждение пары" : "ответить на предложение пары" : "продолжить темы знакомства"}
    </Link>)}
    {inbox.error && <p className="app-muted mb-2 text-sm" role="status">Не удалось проверить входящие. Их можно обновить на экране знакомств.</p>}
    <Link href="/match/inbox" className="app-btn-secondary px-3 py-2">{incoming.length ? "Ответить на интерес" : "Входящие и знакомства"}</Link>
  </div>;
}

export default function ContinuationPanel({ pairId, pairStatus, existingPartnerIntent }: {
  pairId?: string | null;
  pairStatus?: "active" | "paused" | "ended" | null;
  existingPartnerIntent?: boolean;
}) {
  const flow = useDevelopment();
  const { data: currentUser } = useCurrentUser();
  const hasExistingPartnerIntent = existingPartnerIntent ?? currentUser?.entryCohort === "EXISTING_PARTNER";
  const runs = flow.overview ? resumableDevelopmentRuns(flow.overview, pairId, pairStatus).slice(0, 3) : [];
  const programs = flow.overview?.programs.filter((program) => program.completedSteps > 0 && program.completedSteps < program.contentKeys.length) ?? [];
  useRefreshOnReturn(async () => { await flow.reload(); }, !flow.loading);
  return <section className="app-panel app-panel-solid mt-4 p-4 sm:p-5" aria-label="Продолжить свой путь">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Продолжить свой путь</h2><p className="app-muted mt-1 text-sm">Личное развитие доступно в вашем темпе, в том числе пока вы ждёте другого человека.</p></div>
      <button type="button" disabled={flow.loading || flow.busy} className="app-btn-secondary px-3 py-2 text-sm" onClick={() => void flow.reload()}>Обновить занятия</button>
    </div>
    {flow.error && <p className="app-muted mt-3 text-sm" role="status">Не удалось проверить сохранённые занятия. Попробуйте обновить.</p>}
    {runs.map((run) => <div className="app-panel-soft mt-3 p-3" key={run.id}>
      <p className="font-medium">{flow.overview?.content.find((card) => card.key === run.contentKey)?.title ?? "Сохранённое занятие"}</p>
      <p className="app-muted mt-1 text-sm">{developmentRunStatus(run, pairStatus === "paused")}</p>
      <Link className="mt-2 inline-block text-sm underline" href={developmentRunHref(run.id)}>{run.myCompletion || pairStatus === "paused" && run.pairId ? "Открыть сохранённое занятие" : "Продолжить занятие"}</Link>
    </div>)}
    {programs.map((program) => <Link key={program.key} href={`/development?program=${encodeURIComponent(program.key)}#programs`} className="mt-3 block text-sm underline">Продолжить программу «{program.title}» · {program.completedSteps} из {program.contentKeys.length}</Link>)}
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href="/development" className="app-btn-primary px-3 py-2">{runs.length ? "Все занятия и программы" : "Выбрать личное занятие"}</Link>
      {!pairId && (hasExistingPartnerIntent ? <Link href="/invite" className="app-btn-secondary px-3 py-2">Продолжить приглашение партнёра</Link> : <Link href="/match-card/create" className="app-btn-secondary px-3 py-2">Настроить поиск партнёра</Link>)}
    </div>
    {!pairId && !hasExistingPartnerIntent && <MatchingContinuations />}
  </section>;
}
