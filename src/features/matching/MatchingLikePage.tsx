"use client";

import type { MatchPublicCardDTO } from "@/client/api/match.api";
import type { MatchingAnswers, MatchingStatementReaction } from "@/lib/contracts/matchingProduct";
import Link from "next/link";
import MatchingAccessGate, { useMatchingProgressAllowed } from "@/components/matching/MatchingAccessGate";
import { matchingHistoryLikeActions } from "@/client/viewmodels/matchingHistory";
import { useMatchLike } from "@/client/hooks/useMatchLike";
import { useMatchingConnection } from "@/client/hooks/useMatchingConnection";
import { matchingLikeStatusLabel } from "@/client/viewmodels/matching";
import LikeComposer from "@/components/matching/LikeComposer";
import MatchingAvatar from "@/components/matching/MatchingAvatar";
import MatchingConnectionCard from "@/components/matching/MatchingConnectionCard";
import MatchingErrorPanel from "@/components/matching/MatchingErrorPanel";
import LoadingView from "@/components/ui/LoadingView";

export default function MatchingLikePage({ likeId }: { likeId: string }) {
  return <MatchingAccessGate allowHistory><MatchingLikePageContent likeId={likeId} /></MatchingAccessGate>;
}

function MatchingLikePageContent({ likeId }: { likeId: string }) {
  const match = useMatchLike(likeId);
  const like = match.like;
  const canProgress = useMatchingProgressAllowed();
  const allowedActions = matchingHistoryLikeActions(like?.allowedActions ?? [], canProgress);

  return (
    <main className="app-shell-narrow py-4 sm:py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="app-btn-secondary" href="/match/inbox">
          ← К интересам
        </Link>
        {canProgress && <Link className="text-sm underline" href="/search">
          Открыть ленту
        </Link>}
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

            {like.card?.boundaries && <section className="app-panel-soft mt-4 p-4"><h2 className="font-semibold">Чего человек не принимает</h2><ul className="mt-2 list-disc pl-5">{like.card.boundaries.map((text, index) => <li key={index}>{text}{like.card?.boundaryDealbreakers?.[index] ? " · непреодолимая граница" : ""}</li>)}</ul></section>}
            {like.initiatorReactions && like.targetCard && <ReactionBlock title="Реакции инициатора" card={like.targetCard} reactions={like.initiatorReactions} />}
            {like.responseReactions && like.initiatorCard && <ReactionBlock title="Реакции получателя" card={like.initiatorCard} reactions={like.responseReactions} />}
            {like.initiatorAnswers && (
              <AnswerBlock
                title="Ответ инициатора"
                answers={like.initiatorAnswers}
                questions={like.targetCard?.questions}
              />
            )}
            {like.responseAnswers && (
              <AnswerBlock
                title="Ответ получателя"
                answers={like.responseAnswers}
                questions={like.initiatorCard?.questions}
              />
            )}
          </section>

          {allowedActions.includes("RESPOND") && (
            <section className="app-panel p-4 sm:p-6">
              <LikeComposer
                card={like.card}
                questions={like.questions ?? like.card?.questions ?? ["", ""]}
                loading={match.actionLoading}
                mode="respond"
                onSubmit={match.respond}
              />
            </section>
          )}

          {(allowedActions.includes("ACCEPT") ||
            allowedActions.includes("DECLINE") ||
            allowedActions.includes("WITHDRAW") ||
            allowedActions.includes("BLOCK")) && (
            <section className="app-panel p-4 sm:p-6">
              <h2 className="text-xl font-semibold">Ваше решение</h2>
              <p className="app-muted mt-1 text-sm">
                Знакомство начинается после ответа получателя и его согласия.
                Пара требует отдельного подтверждения обоих.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {allowedActions.includes("WITHDRAW") && <button className="app-btn-secondary" type="button" disabled={match.actionLoading} onClick={() => void match.withdraw()}>Отозвать интерес</button>}
                {allowedActions.includes("ACCEPT") && (
                  <button
                    className="app-btn-success"
                    type="button"
                    disabled={match.actionLoading}
                    onClick={() => void match.accept()}
                  >
                    Принять ответ
                  </button>
                )}
                {allowedActions.includes("DECLINE") && (
                  <button
                    className="app-btn-secondary"
                    type="button"
                    disabled={match.actionLoading}
                    onClick={() => void match.reject()}
                  >
                    Вежливо отказаться
                  </button>
                )}
                {allowedActions.includes("BLOCK") && (
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

          {like.connection && <ConnectionSection initial={like.connection} canProgress={canProgress} />}
        </div>
      )}
    </main>
  );
}

function AnswerBlock({
  title,
  answers,
  questions,
}: {
  title: string;
  answers: MatchingAnswers;
  questions?: MatchingAnswers;
}) {
  return (
    <section className="mt-5">
      <h2 className="font-semibold">{title}</h2>
      <ol className="mt-2 grid gap-2">
        {answers.map((answer, index) => (
          <li className="app-panel-soft p-3 text-sm" key={`${index}-${answer}`}>
            {questions?.[index] && <p className="font-semibold">{questions[index]}</p>}{answer}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConnectionSection({
  initial,
  canProgress,
}: {
  initial: NonNullable<ReturnType<typeof useMatchLike>["like"]>["connection"];
  canProgress: boolean;
}) {
  const connectionState = useMatchingConnection(initial?.id ?? null, initial);
  if (!connectionState.connection) return null;
  return (
    <>
      <MatchingErrorPanel error={connectionState.error} />
      <MatchingConnectionCard
        connection={connectionState.connection}
        canProgress={canProgress}
        loading={connectionState.actionLoading}
        onAction={connectionState.confirm}
      />
    </>
  );
}

function ReactionBlock({ title, card, reactions }: { title: string; card: MatchPublicCardDTO; reactions: MatchingStatementReaction[] }) {
  const labels = { AGREE: "Согласен", NEUTRAL: "Нейтрально", AGAINST: "Против" };
  const sections = { give: "Даю", requirements: "Ожидаю", boundaries: "Не принимаю" };
  if (!reactions.length) return null;
  return <section className="mt-5"><h2 className="font-semibold">{title}</h2><ul className="mt-2 grid gap-2">{reactions.map((item) => <li className="app-panel-soft p-3 text-sm" key={`${item.section}:${item.index}`}><p className="app-muted">{sections[item.section]}</p><p>{card[item.section]?.[item.index]}</p><strong>{labels[item.reaction]}</strong>{item.note && <p className="mt-1 whitespace-pre-wrap">{item.note}</p>}</li>)}</ul></section>;
}
