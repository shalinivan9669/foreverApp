"use client";

import Link from "next/link";
import { useState } from "react";
import type { MatchLikeSummaryDTO } from "@/client/api/match.api";
import { useInbox } from "@/client/hooks/useInbox";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { matchingLikeStatusLabel } from "@/client/viewmodels/matching";
import MatchingAvatar from "@/components/matching/MatchingAvatar";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import LoadingView from "@/components/ui/LoadingView";

type InboxTab = "incoming" | "outgoing" | "connections";

export default function MatchingInboxPage() {
  const inbox = useInbox();
  const [tab, setTab] = useState<InboxTab>("incoming");
  const items = tab === "incoming" ? inbox.incoming : inbox.outgoing;
  useRefreshOnReturn(async () => { await inbox.refetch(); }, !inbox.loading && !inbox.actionLoading);

  return (
    <main className="app-shell-compact py-4 sm:py-6">
      <header className="app-panel mb-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-accent text-lg text-rose-700">
              Продолжение знакомства
            </p>
            <h1 className="app-page-title mt-1">Интересы и связи</h1>
            <p className="app-muted mt-2 text-sm sm:text-base">
              Ответы, взаимные знакомства и подтверждение отношений — в одном
              месте.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="app-btn-secondary" disabled={inbox.loading || inbox.actionLoading} onClick={() => void inbox.refetch()}>Обновить знакомства</button>
            <Link className="app-btn-secondary" href="/search">
              К ленте
            </Link>
            <Link className="app-btn-secondary" href="/match-card/create">
              Моя карточка
            </Link>
          </div>
        </div>
      </header>

      <div
        className="app-panel-soft mb-5 flex flex-wrap gap-2 p-2"
        role="tablist"
      >
        <TabButton
          active={tab === "incoming"}
          onClick={() => setTab("incoming")}
        >
          Входящие ({inbox.incoming.length})
        </TabButton>
        <TabButton
          active={tab === "outgoing"}
          onClick={() => setTab("outgoing")}
        >
          Исходящие ({inbox.outgoing.length})
        </TabButton>
        <TabButton
          active={tab === "connections"}
          onClick={() => setTab("connections")}
        >
          Взаимные ({inbox.connections.length})
        </TabButton>
      </div>

      <MatchingErrorPanel
        error={inbox.error}
        onRetry={() => void inbox.refetch()}
      />
      {inbox.loading && <LoadingView label="Загружаем знакомства…" />}

      {!inbox.loading && tab !== "connections" && items.length === 0 && (
        <div className="app-panel-soft p-5 text-center" role="status">
          <h2 className="text-xl font-semibold">
            {tab === "incoming"
              ? "Новых входящих пока нет"
              : "Исходящих пока нет"}
          </h2>
          <p className="app-muted mt-2 text-sm">
            {tab === "incoming"
              ? "Когда кто-то проявит интерес, карточка появится здесь."
              : "Откройте ленту и начните знакомство с искреннего ответа."}
          </p>
        </div>
      )}

      {!inbox.loading && tab !== "connections" && items.length > 0 && (
        <section className="grid gap-3" aria-label="Интересы">
          {items.map((like) => (
            <LikeRow key={like.id} like={like} />
          ))}
        </section>
      )}

      {!inbox.loading &&
        tab === "connections" &&
        inbox.connections.length === 0 && (
          <div className="app-panel-soft p-5 text-center" role="status">
            <h2 className="text-xl font-semibold">
              Взаимных знакомств пока нет
            </h2>
            <p className="app-muted mt-2 text-sm">
              Знакомство появится после ответа и явного принятия получателем интереса.
            </p>
          </div>
        )}

      {tab === "connections" && inbox.connections.length > 0 && (
        <section className="grid gap-4" aria-label="Взаимные знакомства">
          {inbox.connections.map((connection) => (
            <MatchingConnectionCard
              key={connection.id}
              connection={connection}
              loading={inbox.actionLoading}
              onAction={(action) =>
                inbox.confirmConnection(connection.id, action)
              }
            />
          ))}
        </section>
      )}

      {inbox.nextCursor && (
        <div className="mt-5 text-center">
          <button
            className="app-btn-secondary"
            type="button"
            disabled={inbox.loading}
            onClick={() => void inbox.loadMore()}
          >
            Показать ещё
          </button>
        </div>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? "app-btn-primary" : "app-btn-secondary"}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LikeRow({ like }: { like: MatchLikeSummaryDTO }) {
  return (
    <Link
      className="app-panel app-lift flex items-center gap-3 p-4"
      href={`/match/like/${encodeURIComponent(like.id)}`}
    >
      <MatchingAvatar
        username={like.peer.username}
        avatar={like.peer.avatar}
        size={52}
      />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold">{like.peer.username}</h2>
        <p className="app-muted text-sm">
          {matchingLikeStatusLabel(like.status)}
        </p>
      </div>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
