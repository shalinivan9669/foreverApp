"use client";

import Link from "next/link";
import MatchingAccessGate, { useMatchingProgressAllowed } from "@/components/matching/MatchingAccessGate";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/client/api/errors";
import { useApi } from "@/client/hooks/useApi";
import { useMatchingConnection } from "@/client/hooks/useMatchingConnection";
import { matchingConversationApi, type ConversationCommand } from "@/client/api/matchingConversation.api";
import type { MatchingConversationDTO, MatchingConversationRoundDTO } from "@/lib/contracts/matchingProduct";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import { createIdempotencyKey } from "@/client/api/idempotency";
import { confirmAppNavigation, useUnsavedChanges } from "@/client/hooks/useUnsavedChanges";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import LoadingView from "@/components/ui/LoadingView";
import type { MatchingConnectionDTO } from "@/client/api/match.api";

export default function MatchingConnectionPage({ connectionId }: { connectionId: string }) {
  return <MatchingAccessGate allowHistory><MatchingConnectionPageContent connectionId={connectionId} /></MatchingAccessGate>;
}

function MatchingConnectionPageContent({ connectionId }: { connectionId: string }) {
  const connection = useMatchingConnection(connectionId);
  const canProgress = useMatchingProgressAllowed();
  const [loaded, setLoaded] = useState<{ id: string; data: MatchingConversationDTO } | null>(null);
  const conversation = loaded?.id === connectionId ? loaded.data : null;
  const currentConnection = connection.connection?.id === connectionId ? connection.connection : null;
  const api = useApi("matching-conversation");
  const { runSafe } = api;
  const requestVersion = useRef(0);
  const mutationPending = useRef<string | null>(null);
  const retryAttempt = useRef<{ signature: string; key: string } | null>(null);
  const handleAccessLoss = useCallback((error: Error) => {
    if (error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(error.code))) setLoaded((current) => current?.id === connectionId ? null : current);
  }, [connectionId]);
  const load = useCallback(async () => {
    if (mutationPending.current === connectionId) return;
    const version = ++requestVersion.current;
    const result = await runSafe(async () => {
      try { return await matchingConversationApi.get(connectionId); }
      catch (error) { if (version === requestVersion.current && error instanceof Error) handleAccessLoss(error); throw error; }
    }, { suppressGlobalError: true });
    if (result && version === requestVersion.current) setLoaded({ id: connectionId, data: result });
  }, [connectionId, runSafe, handleAccessLoss]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; requestVersion.current += 1; }; }, [load]);
  const mutate = async (command: ConversationCommand) => {
    if (!canProgress && command.action !== "WITHDRAW" && !(command.action === "DISCORD_CONSENT" && !command.discordConsent)) return false;
    if (mutationPending.current === connectionId) return false;
    mutationPending.current = connectionId;
    const version = ++requestVersion.current;
    const signature = JSON.stringify({ connectionId, command });
    if (retryAttempt.current?.signature !== signature) retryAttempt.current = { signature, key: createIdempotencyKey() };
    const key = retryAttempt.current.key;
    const result = await runSafe(async () => {
      try { return await matchingConversationApi.update(connectionId, command, { idempotencyKey: key }); }
      catch (error) { if (version === requestVersion.current && error instanceof Error) handleAccessLoss(error); throw error; }
    }, { suppressGlobalError: true });
    if (mutationPending.current === connectionId) mutationPending.current = null;
    if (!result || version !== requestVersion.current) return false;
    retryAttempt.current = null;
    setLoaded({ id: connectionId, data: result });
    await connection.refetch();
    return true;
  };
  const canWrite = Boolean(canProgress && conversation?.canWrite && currentConnection?.status === "ACTIVE" && !currentConnection.pairId);
  const nextTopic = canWrite ? conversation?.topics.find((topic) => !topic.ownAnswer && topic.partnerSubmitted) ?? conversation?.topics.find((topic) => !topic.ownAnswer) : null;
  const waitingCount = conversation?.topics.filter((topic) => topic.ownAnswer && !topic.revealed).length ?? 0;
  const refresh = async () => { await Promise.all([load(), connection.refetch()]); };
  useRefreshOnReturn(load, Boolean(conversation) && !api.loading && !connection.actionLoading);
  const accessLost = api.error && ([401, 403, 404].includes(api.error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(api.error.code));
  const accessibleConversation = currentConnection && ["ACTIVE", "PAUSED"].includes(currentConnection.status) && !currentConnection.pairId && !accessLost ? conversation : null;
  const canWithdraw = Boolean(accessibleConversation && currentConnection?.status === "ACTIVE");
  return <main className="app-shell-narrow space-y-5 py-6">
    <header className="flex items-center justify-between gap-3"><Link className="app-btn-secondary" href="/match/inbox">← К знакомствам</Link><button className="app-btn-secondary" disabled={api.loading || connection.loading || connection.actionLoading} onClick={() => void refresh()}>Обновить состояние и ответы</button></header>
    <h1 className="text-2xl font-semibold">Узнаём друг друга</h1>
    <MatchingErrorPanel error={api.error ?? connection.error} onRetry={() => void refresh()} />
    {!conversation && !api.error && <LoadingView label="Загружаем темы знакомства…" />}
    {currentConnection && <MatchingConnectionCard connection={currentConnection} canProgress={canProgress} loading={connection.actionLoading || api.loading} onAction={async (action) => { if (!confirmAppNavigation()) return false; const ok = await connection.confirm(action); if (ok) await load(); return ok; }} />}
    {accessibleConversation && conversation && <>
      <section className="app-panel p-4" aria-label="Продолжение знакомства"><h2 className="font-semibold">{canWrite ? nextTopic ? `Следующая тема: ${nextTopic.title}` : waitingCount ? "Ваши ответы сохранены" : "Все текущие темы раскрыты" : currentConnection?.status === "PAUSED" ? "Знакомство на паузе" : "Сохранённые темы знакомства"}</h2><p className="app-muted mt-2 text-sm">{canWrite ? nextTopic ? nextTopic.partnerSubmitted ? "Партнёр уже ответил. Сохраните свой независимый ответ, чтобы оба текста открылись." : "Можно начать тему независимо; ответы откроются после второго участника." : waitingCount ? `Ожидаем партнёра в ${waitingCount} темах. После его ответа нажмите «Обновить состояние и ответы».` : "Обсудите ответы. Можно начать новый раунд или предложить стать парой, когда оба готовы." : canProgress && currentConnection?.status === "PAUSED" ? "Сохранённые темы можно просмотреть. Возобновите знакомство, чтобы отвечать дальше." : "Доступны сохранённые ответы. Новые ответы в текущем режиме недоступны; нераскрытый собственный ответ можно отозвать в активном знакомстве."}</p>{nextTopic && <a href={`#topic-${nextTopic.topicKey}`} className="app-btn-primary mt-3">Продолжить тему</a>}<Link href="/development" className="app-btn-secondary ml-2 mt-3">Личное развитие</Link></section>
      <section className="app-panel p-4"><h2 className="text-lg font-semibold">Готовность к следующему шагу</h2><p className="app-muted mt-2 text-sm">Это подсказки для разговора. Здесь нет баллов, оценки человека или обязательного порога для предложения пары. «Обсудили» не означает «согласны».</p><ul className="mt-3 space-y-2">{conversation.checklist.map((item) => <li key={item.key}>{item.complete ? "✓" : "○"} {item.label}</li>)}</ul></section>
      <section className="app-panel p-4"><h2 className="font-semibold">Темы для независимых ответов</h2><p className="app-muted mt-2 text-sm">Сначала каждый отвечает отдельно. После второго ответа оба текста откроются одновременно. До раскрытия свой ответ можно отозвать; после раскрытия изменения создают новый раунд. Ответы не используются для подбора или личной аналитики.</p></section>
      {conversation.topics.map((topic) => <Topic key={`${connectionId}:${topic.topicKey}`} topic={topic} initiallyOpen={topic.topicKey === nextTopic?.topicKey} loading={api.loading || connection.actionLoading} canWrite={canWrite} canWithdraw={canWithdraw} mutate={mutate} />)}
      <MatchingDiscordConsentRevocation historyOnly={!canProgress} connection={currentConnection} conversation={accessibleConversation} loading={api.loading || connection.actionLoading} onRevoke={() => mutate({ action: "DISCORD_CONSENT", discordConsent: false })} />
      {canProgress && <section className="app-panel p-4"><h2 className="font-semibold">Продолжить в Discord</h2><p className="app-muted mt-2 text-sm">После обсуждения границ и интереса можно добровольно перейти в Discord. Эта кнопка не даёт приложению доступ к переписке.</p>{conversation.discordAvailable && canWrite ? <><label className="mt-3 flex gap-2"><input type="checkbox" checked={conversation.discordConsent} disabled={api.loading} onChange={(event) => void mutate({ action: "DISCORD_CONSENT", discordConsent: event.target.checked })} />Хочу открыть профиль человека в Discord</label>{conversation.discordUrl && <a className="app-btn-primary mt-3" href={conversation.discordUrl} target="_blank" rel="noreferrer">Открыть Discord</a>}</> : <p className="mt-3 text-sm">Сначала обменяйтесь ответами о границах и взаимном интересе.</p>}</section>}
    </>}
  </main>;
}

export function MatchingDiscordConsentRevocation({ historyOnly, connection, conversation, loading, onRevoke }: {
  historyOnly: boolean;
  connection: Pick<MatchingConnectionDTO, "status" | "pairId"> | null;
  conversation: Pick<MatchingConversationDTO, "discordConsent"> | null;
  loading: boolean;
  onRevoke: () => Promise<boolean>;
}) {
  if (!historyOnly || connection?.status !== "ACTIVE" || connection.pairId || !conversation?.discordConsent) return null;
  return <section className="app-panel p-4"><h2 className="font-semibold">Сохранённое разрешение Discord</h2><p className="app-muted mt-2 text-sm">Ранее вы разрешили показывать переход к профилю человека в Discord. Это разрешение можно отозвать.</p><button type="button" className="app-btn-secondary mt-3" disabled={loading} onClick={() => void onRevoke()}>Отозвать разрешение перехода в Discord</button></section>;
}

function Topic({ topic, canWrite, canWithdraw, loading, mutate, initiallyOpen }: { topic: MatchingConversationRoundDTO; canWrite: boolean; canWithdraw: boolean; loading: boolean; mutate: (command: ConversationCommand) => Promise<boolean>; initiallyOpen: boolean }) {
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const summary = useRef<HTMLElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const pending = loading || submitting;
  useUnsavedChanges(Boolean(text || consent), submitting);
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  const submit = async () => {
    if (!consent || !text.trim() || pending || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (await mutate({ action: "SUBMIT", topicKey: topic.topicKey, round: topic.revealed ? topic.round + 1 : topic.round, text: text.trim(), revealConsent: true })) {
        setText(""); setConsent(false); setEditing(false); summary.current?.focus();
      }
    } finally { submitLock.current = false; setSubmitting(false); }
  };
  return <details id={`topic-${topic.topicKey}`} open={initiallyOpen || undefined} className="app-panel scroll-mt-4 p-4"><summary ref={summary} className="min-h-11 cursor-pointer font-semibold">{topic.title} · {topic.revealed ? "Ответы открыты" : topic.ownAnswer ? "Ожидаем партнёра" : topic.partnerSubmitted ? "Партнёр ответил" : "Можно начать"}</summary>
    <h3 className="mt-3 font-semibold">{topic.prompt}</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Готовность участников" aria-live="polite"><section className="app-panel-soft p-3"><h4 className="font-semibold">Вы</h4><p className="mt-1 text-sm">{topic.ownAnswer ? 'Ответ сохранён' : 'Ещё не ответили'}</p></section><section className="app-panel-soft p-3"><h4 className="font-semibold">Партнёр</h4><p className="mt-1 text-sm">{topic.partnerSubmitted ? 'Ответ сохранён' : 'Ещё не ответил'}</p></section></div>
    <details className="mt-3 text-sm"><summary className="cursor-pointer py-2">Как открываются ответы · раунд {topic.round}</summary><p className="app-muted mt-2">Каждый отвечает независимо и явно разрешает раскрытие после второго ответа. До раскрытия свой ответ можно отозвать. Новый ответ после раскрытия начинает новый раунд; прежние ответы не переписываются. Эти тексты не используются для подбора или личной аналитики.</p></details>
    {(topic.ownAnswer || (topic.revealed && topic.partnerAnswer)) && <div className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Ответы участников">
      {topic.ownAnswer && <div className="app-panel-soft min-w-0 p-3"><strong>Мой ответ</strong><p className="mt-2 whitespace-pre-wrap break-words">{topic.ownAnswer}</p></div>}
      {topic.revealed && topic.partnerAnswer && <div className="app-panel-soft min-w-0 p-3"><strong>Ответ партнёра</strong><p className="mt-2 whitespace-pre-wrap break-words">{topic.partnerAnswer}</p></div>}
    </div>}
    {!topic.revealed && topic.ownAnswer && <p className="app-muted mt-3 text-sm" role="status">Ваш ответ сохранён. Отвечать повторно не нужно. Оба текста откроются после ответа партнёра.</p>}
    {!topic.revealed && topic.ownAnswer && canWithdraw && <button className="app-btn-secondary mt-3" disabled={loading} onClick={() => void mutate({ action: "WITHDRAW", topicKey: topic.topicKey, round: topic.round })}>Отозвать мой ответ до раскрытия</button>}
    {canWrite && topic.revealed && !editing && <button type="button" className="app-btn-secondary mt-3" disabled={pending} onClick={() => setEditing(true)}>Написать ответ нового раунда</button>}
    {canWrite && (!topic.ownAnswer || (topic.revealed && editing)) && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="grid gap-2">{topic.revealed ? "Ответ нового раунда" : "Мой независимый ответ"}<textarea ref={editor} className="min-h-28 w-full p-3" maxLength={2000} required disabled={pending} value={text} onChange={(event) => setText(event.target.value)} /><span className="app-muted text-xs">{text.length}/2000 · Черновик остаётся только на этом экране.</span></label>
      <label className="flex min-h-11 gap-3 py-2 text-sm"><input type="checkbox" disabled={pending} checked={consent} onChange={(event) => setConsent(event.target.checked)} />Понимаю: после ответа обоих мой текст увидит партнёр. До этого я могу его отозвать.</label>
      <p className="app-muted text-sm" role="status">{pending ? 'Сохраняем. Дождитесь результата.' : !text.trim() ? 'Напишите свой ответ.' : !consent ? 'Прочитайте и подтвердите правило раскрытия.' : 'Ответ готов к сохранению.'}</p>
      <button className="app-btn-primary" disabled={pending || !consent || !text.trim()}>{submitting ? 'Сохраняем…' : topic.revealed ? "Начать новый раунд" : "Сохранить независимый ответ"}</button>
    </form>}
  </details>;
}
