"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/client/api/errors";
import { useApi } from "@/client/hooks/useApi";
import { useMatchingConnection } from "@/client/hooks/useMatchingConnection";
import { matchingConversationApi, type ConversationCommand } from "@/client/api/matchingConversation.api";
import type { MatchingConversationDTO, MatchingConversationRoundDTO } from "@/lib/contracts/matchingProduct";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";

export default function MatchingConnectionPage({ connectionId }: { connectionId: string }) {
  const connection = useMatchingConnection(connectionId);
  const [loaded, setLoaded] = useState<{ id: string; data: MatchingConversationDTO } | null>(null);
  const conversation = loaded?.id === connectionId ? loaded.data : null;
  const currentConnection = connection.connection?.id === connectionId ? connection.connection : null;
  const api = useApi("matching-conversation");
  const { runSafe } = api;
  const handleAccessLoss = useCallback((error: Error) => {
    if (error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || error.code === "MATCHING_BLOCKED")) setLoaded((current) => current?.id === connectionId ? null : current);
  }, [connectionId]);
  const load = useCallback(async () => {
    const result = await runSafe(async () => {
      try { return await matchingConversationApi.get(connectionId); }
      catch (error) { if (error instanceof Error) handleAccessLoss(error); throw error; }
    }, { suppressGlobalError: true });
    if (result) setLoaded({ id: connectionId, data: result });
  }, [connectionId, runSafe, handleAccessLoss]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  const mutate = async (command: ConversationCommand) => {
    const result = await runSafe(async () => {
      try { return await matchingConversationApi.update(connectionId, command); }
      catch (error) { if (error instanceof Error) handleAccessLoss(error); throw error; }
    }, { suppressGlobalError: true });
    if (!result) return false;
    setLoaded({ id: connectionId, data: result });
    await connection.refetch();
    return true;
  };
  const canWrite = Boolean(conversation?.canWrite && currentConnection?.status === "ACTIVE" && !currentConnection.pairId);
  return <main className="app-shell-narrow space-y-5 py-6">
    <header className="flex items-center justify-between gap-3"><Link className="app-btn-secondary" href="/match/inbox">← К знакомствам</Link><button className="app-btn-secondary" disabled={api.loading} onClick={() => void load()}>Обновить ответы</button></header>
    <h1 className="text-2xl font-semibold">Узнаём друг друга</h1>
    <MatchingErrorPanel error={api.error ?? connection.error} />
    {currentConnection && <MatchingConnectionCard connection={currentConnection} loading={connection.actionLoading} onAction={async (action) => { const ok = await connection.confirm(action); if (ok) await load(); return ok; }} />}
    {conversation && <>
      <section className="app-panel p-4"><h2 className="text-lg font-semibold">Готовность к следующему шагу</h2><p className="app-muted mt-2 text-sm">Это подсказки для разговора. Здесь нет баллов, оценки человека или обязательного порога для предложения пары. «Обсудили» не означает «согласны».</p><ul className="mt-3 space-y-2">{conversation.checklist.map((item) => <li key={item.key}>{item.complete ? "✓" : "○"} {item.label}</li>)}</ul></section>
      <section className="app-panel p-4"><h2 className="font-semibold">Темы для независимых ответов</h2><p className="app-muted mt-2 text-sm">Сначала каждый отвечает отдельно. После второго ответа оба текста откроются одновременно. До раскрытия свой ответ можно отозвать; после раскрытия изменения создают новый раунд. Ответы не используются для подбора или личной аналитики.</p></section>
      {conversation.topics.map((topic) => <Topic key={`${topic.topicKey}:${topic.round}:${topic.revealed}:${topic.ownAnswer ?? ""}`} topic={topic} loading={api.loading} canWrite={canWrite} mutate={mutate} />)}
      <section className="app-panel p-4"><h2 className="font-semibold">Продолжить в Discord</h2><p className="app-muted mt-2 text-sm">После обсуждения границ и интереса можно добровольно перейти в Discord. Эта кнопка не даёт приложению доступ к переписке.</p>{conversation.discordAvailable && canWrite ? <><label className="mt-3 flex gap-2"><input type="checkbox" checked={conversation.discordConsent} disabled={api.loading} onChange={(event) => void mutate({ action: "DISCORD_CONSENT", discordConsent: event.target.checked })} />Хочу открыть профиль человека в Discord</label>{conversation.discordUrl && <a className="app-btn-primary mt-3" href={conversation.discordUrl} target="_blank" rel="noreferrer">Открыть Discord</a>}</> : <p className="mt-3 text-sm">Сначала обменяйтесь ответами о границах и взаимном интересе.</p>}</section>
    </>}
  </main>;
}

function Topic({ topic, canWrite, loading, mutate }: { topic: MatchingConversationRoundDTO; canWrite: boolean; loading: boolean; mutate: (command: ConversationCommand) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  return <details className="app-panel p-4"><summary className="cursor-pointer font-semibold">{topic.title} · раунд {topic.round} · {topic.revealed ? "Ответы открыты" : topic.ownAnswer ? "Ожидаем партнёра" : topic.partnerSubmitted ? "Партнёр ответил" : "Можно начать"}</summary><p className="mt-3">{topic.prompt}</p>
    {topic.ownAnswer && <div className="app-panel-soft mt-3 p-3"><strong>Мой ответ</strong><p className="whitespace-pre-wrap">{topic.ownAnswer}</p></div>}
    {topic.revealed && topic.partnerAnswer && <div className="app-panel-soft mt-3 p-3"><strong>Ответ партнёра</strong><p className="whitespace-pre-wrap">{topic.partnerAnswer}</p></div>}
    {!topic.revealed && topic.ownAnswer && canWrite && <button className="app-btn-secondary mt-3" disabled={loading} onClick={() => void mutate({ action: "WITHDRAW", topicKey: topic.topicKey, round: topic.round })}>Отозвать мой ответ до раскрытия</button>}
    {canWrite && (!topic.ownAnswer || topic.revealed) && <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); if (consent && text.trim()) void mutate({ action: "SUBMIT", topicKey: topic.topicKey, round: topic.revealed ? topic.round + 1 : topic.round, text: text.trim(), revealConsent: true }); }}>
      <label className="grid gap-2">{topic.revealed ? "Ответ нового раунда" : "Мой независимый ответ"}<textarea className="min-h-28 p-3" maxLength={2000} required value={text} onChange={(event) => setText(event.target.value)} /></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />Понимаю: после ответа обоих мой текст увидит партнёр. До этого я могу его отозвать.</label>
      <button className="app-btn-primary" disabled={loading || !consent || !text.trim()}>{topic.revealed ? "Начать новый раунд" : "Сохранить независимый ответ"}</button>
    </form>}
  </details>;
}
