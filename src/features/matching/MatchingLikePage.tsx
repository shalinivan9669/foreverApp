"use client";

import Link from "next/link";
import { useMatchLike } from "@/client/hooks/useMatchLike";
import { useMatchingConnection } from "@/client/hooks/useMatchingConnection";
import { matchingLikeStatusLabel } from "@/client/viewmodels/matching";
import LikeComposer from "@/components/matching/LikeComposer";
import MatchingAvatar from "@/components/matching/MatchingAvatar";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import LoadingView from "@/components/ui/LoadingView";

export default function MatchingLikePage({ likeId }: { likeId: string }) {
  const match = useMatchLike(likeId);
  const like = match.like;

  return (
    <main className="app-shell-narrow py-4 sm:py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="app-btn-secondary" href="/match/inbox">
          ← К интересам
        </Link>
        <Link className="text-sm underline" href="/search">
          Открыть ленту
        </Link>
      </header>

      <MatchingErrorPanel
        error={match.error}
        onRetry={() => void match.refetch()}
      />
      {match.loading && <LoadingView label="Открываем знакомство…" />}

      {like && (
        <div className="grid gap-5">
          <section className="app-panel p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <MatchingAvatar
                username={like.peer.username}
                avatar={like.peer.avatar}
              />
              <div>
                <h1 className="text-2xl font-semibold">{like.peer.username}</h1>
                <p className="app-muted mt-1 text-sm">
                  {matchingLikeStatusLabel(like.status)}
                </p>
              </div>
            </div>

            {like.card && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <section className="app-panel-soft p-4">
                  <h2 className="font-semibold">Для меня важно</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {like.card.requirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
                {like.card.give && (
                  <section className="app-panel-soft p-4">
                    <h2 className="font-semibold">Что я готов(а) дать</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {like.card.give.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {like.initiatorAnswers && (
              <AnswerBlock
                title="Ответ инициатора"
                answers={like.initiatorAnswers}
              />
            )}
            {like.responseAnswers && (
              <AnswerBlock
                title="Ответ получателя"
                answers={like.responseAnswers}
              />
            )}
          </section>

          {like.allowedActions.includes("RESPOND") && (
            <section className="app-panel p-4 sm:p-6">
              <LikeComposer
                questions={like.questions ?? like.card?.questions ?? ["", ""]}
                loading={match.actionLoading}
                mode="respond"
                onSubmit={match.respond}
              />
            </section>
          )}

          {(like.allowedActions.includes("ACCEPT") ||
            like.allowedActions.includes("DECLINE") ||
            like.allowedActions.includes("BLOCK")) && (
            <section className="app-panel p-4 sm:p-6">
              <h2 className="text-xl font-semibold">Ваше решение</h2>
              <p className="app-muted mt-1 text-sm">
                Принятие создаст взаимную связь, но не создаст пару
                автоматически.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {like.allowedActions.includes("ACCEPT") && (
                  <button
                    className="app-btn-success"
                    type="button"
                    disabled={match.actionLoading}
                    onClick={() => void match.accept()}
                  >
                    Принять ответ
                  </button>
                )}
                {like.allowedActions.includes("DECLINE") && (
                  <button
                    className="app-btn-secondary"
                    type="button"
                    disabled={match.actionLoading}
                    onClick={() => void match.reject()}
                  >
                    Вежливо отказаться
                  </button>
                )}
                {like.allowedActions.includes("BLOCK") && (
                  <button
                    className="app-btn-danger"
                    type="button"
                    disabled={match.actionLoading}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Заблокировать пользователя? Он исчезнет из знакомств до ручной разблокировки.",
                        )
                      ) {
                        void match.block();
                      }
                    }}
                  >
                    Заблокировать
                  </button>
                )}
              </div>
            </section>
          )}

          {like.connection && <ConnectionSection initial={like.connection} />}
        </div>
      )}
    </main>
  );
}

function AnswerBlock({
  title,
  answers,
}: {
  title: string;
  answers: [string, string];
}) {
  return (
    <section className="mt-5">
      <h2 className="font-semibold">{title}</h2>
      <ol className="mt-2 grid gap-2">
        {answers.map((answer, index) => (
          <li className="app-panel-soft p-3 text-sm" key={`${index}-${answer}`}>
            {answer}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConnectionSection({
  initial,
}: {
  initial: NonNullable<ReturnType<typeof useMatchLike>["like"]>["connection"];
}) {
  const connectionState = useMatchingConnection(initial?.id ?? null, initial);
  if (!connectionState.connection) return null;
  return (
    <>
      <MatchingErrorPanel error={connectionState.error} />
      <MatchingConnectionCard
        connection={connectionState.connection}
        loading={connectionState.actionLoading}
        onAction={connectionState.confirm}
      />
    </>
  );
}
