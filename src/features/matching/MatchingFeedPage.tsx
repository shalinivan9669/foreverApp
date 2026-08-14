"use client";

import Link from "next/link";
import { useEffect } from "react";
import CandidateCard from "@/components/matching/CandidateCard";
import FitSummary from "@/components/matching/FitSummary";
import LikeComposer from "@/components/matching/LikeComposer";
import MatchingAvatar from "@/components/matching/MatchingAvatar";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import LoadingView from "@/components/ui/LoadingView";
import { useMatchFeed } from "@/client/hooks/useMatchFeed";

export default function MatchingFeedPage() {
  const feed = useMatchFeed();
  const { closeCandidate, selected } = feed;
  const publicCard = feed.candidateCard?.card ?? feed.selected?.card;
  const displayedUser =
    feed.candidateCard?.candidate ?? feed.selected?.candidate;

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeCandidate();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeCandidate, selected]);

  return (
    <main className="app-shell-compact py-4 sm:py-6">
      <header className="app-panel mb-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-accent text-lg text-rose-700">
              Знакомства с вниманием
            </p>
            <h1 className="app-page-title mt-1">
              Люди, с которыми стоит поговорить
            </h1>
            <p className="app-muted mt-2 max-w-2xl text-sm sm:text-base">
              Мы показываем качественные подсказки без процентов и не раскрываем
              чужие личные ответы.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Разделы знакомств">
            <Link className="app-btn-secondary" href="/match-card/create">
              Моя карточка
            </Link>
            <Link className="app-btn-secondary" href="/match/inbox">
              Входящие
            </Link>
          </nav>
        </div>
      </header>

      <MatchingErrorPanel
        error={feed.error}
        onRetry={() => void feed.refetch()}
      />

      {feed.loading && <LoadingView label="Ищем подходящие знакомства…" />}

      {!feed.loading && !feed.error && feed.items.length === 0 && (
        <section className="app-panel-soft p-5 text-center" role="status">
          <h2 className="text-xl font-semibold">Пока новых карточек нет</h2>
          <p className="app-muted mt-2 text-sm">
            Проверьте, активна ли ваша карточка, или загляните позже.
          </p>
          <Link className="app-btn-primary mt-4" href="/match-card/create">
            Проверить профиль
          </Link>
        </section>
      )}

      {feed.items.length > 0 && (
        <section className="app-collection-grid" aria-label="Лента знакомств">
          {feed.items.map((candidate) => (
            <CandidateCard
              key={candidate.candidate.id}
              candidate={candidate}
              loading={feed.actionLoading && feed.selected === candidate}
              onOpen={() => void feed.openCandidate(candidate)}
            />
          ))}
        </section>
      )}

      {feed.nextCursor && (
        <div className="mt-5 text-center">
          <button
            className="app-btn-secondary"
            type="button"
            disabled={feed.loadingMore}
            onClick={() => void feed.loadMore()}
          >
            {feed.loadingMore ? "Загружаем…" : "Показать ещё"}
          </button>
        </div>
      )}

      {feed.selected && (
        <div
          className="app-dialog-layer fixed inset-0 z-50 grid overflow-y-auto bg-slate-950/45 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="candidate-dialog-title"
        >
          <div className="app-panel app-panel-solid m-auto w-full max-w-3xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {displayedUser && (
                  <MatchingAvatar
                    username={displayedUser.username}
                    avatar={displayedUser.avatar}
                  />
                )}
                <div>
                  <h2
                    id="candidate-dialog-title"
                    className="text-2xl font-semibold"
                  >
                    {displayedUser?.username ?? "Карточка знакомства"}
                  </h2>
                  <p className="app-muted text-sm">
                    Узнайте главное перед ответом
                  </p>
                </div>
              </div>
              <button
                className="app-btn-secondary min-h-10 px-3"
                type="button"
                aria-label="Закрыть карточку"
                autoFocus
                onClick={feed.closeCandidate}
              >
                Закрыть
              </button>
            </div>

            {feed.actionLoading && !feed.candidateCard && (
              <div className="mt-5">
                <LoadingView compact label="Открываем карточку…" />
              </div>
            )}
            <div className="mt-5">
              <MatchingErrorPanel error={feed.actionError} />
            </div>

            {publicCard && (
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="space-y-4">
                  <FitSummary
                    fit={feed.candidateCard?.fit ?? feed.selected.fit}
                  />
                  <section className="app-panel-soft p-4">
                    <h3 className="font-semibold">Для меня важно</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {publicCard.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                  {publicCard.give && (
                    <section className="app-panel-soft p-4">
                      <h3 className="font-semibold">Что я готов(а) дать</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {publicCard.give.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
                <LikeComposer
                  questions={publicCard.questions}
                  loading={feed.actionLoading}
                  onSubmit={feed.createLike}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
