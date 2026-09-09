"use client";

import Link from "next/link";
import type { MatchingConnectionDTO } from "@/client/api/match.api";
import {
  matchingConfirmationCopy,
  matchingConnectionStageLabel,
} from "@/client/viewmodels/matching";
import MatchingAvatar from "./MatchingAvatar";
import { matchingHistoryConnectionActions } from "@/client/viewmodels/matchingHistory";

type MatchingConnectionCardProps = {
  connection: MatchingConnectionDTO;
  loading?: boolean;
  canProgress?: boolean;
  onAction: (
    action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE",
  ) => Promise<boolean> | void;
};

const actionCopy = {
  REQUEST: "Предложить стать парой",
  CONFIRM: "Подтвердить отношения",
  CANCEL: "Отменить предложение",
  PAUSE: "Поставить на паузу",
  RESUME: "Продолжить знакомство",
  CLOSE: "Завершить знакомство",
} as const;

export default function MatchingConnectionCard({
  connection,
  loading = false,
  canProgress = true,
  onAction,
}: MatchingConnectionCardProps) {
  const confirmation = !canProgress && !connection.pairId && ["ACTIVE", "PAUSED"].includes(connection.status)
    ? { title: connection.status === "PAUSED" ? "Знакомство на паузе" : "Сохранённое знакомство", description: "Доступны сохранённые темы и безопасное завершение. Продолжение знакомства в текущем режиме отношений недоступно." }
    : matchingConfirmationCopy(connection);
  const allowedActions = matchingHistoryConnectionActions(connection.allowedActions, canProgress);
  return (
    <article className="app-panel p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <MatchingAvatar
          username={connection.participant.username}
          avatar={connection.participant.avatar}
          size={52}
        />
        <div>
          <h3 className="text-lg font-semibold">
            {connection.participant.username}
          </h3>
          <p className="app-muted text-sm">
            {connection.status === "PAUSED" ? "На паузе (занимает место из трёх)" : matchingConnectionStageLabel(connection.stage)}
          </p>
        </div>
      </div>

      {!connection.pairId && ["ACTIVE", "PAUSED"].includes(connection.status) && <Link className="app-btn-secondary mt-4" href={`/match/connections/${encodeURIComponent(connection.id)}`}>Темы и готовность</Link>}
      <div className="app-panel-soft mt-4 p-3">
        <p className="font-semibold">{confirmation.title}</p>
        <p className="app-muted mt-1 text-sm">{confirmation.description}</p>
      </div>

      {connection.pairId && (
        <Link
          className="app-btn-success mt-4 w-full"
          href={`/pair/${encodeURIComponent(connection.pairId)}`}
        >
          Перейти в режим пары
        </Link>
      )}

      {!connection.pairId && allowedActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {allowedActions.map((action) => (
            <button
              className={
                action === "CANCEL" ? "app-btn-secondary" : "app-btn-primary"
              }
              type="button"
              key={action}
              disabled={loading}
              onClick={() => { if (action !== "CLOSE" || window.confirm("Завершить это знакомство? Продолжить его будет нельзя.")) void onAction(action); }}
            >
              {loading ? "Сохраняем…" : actionCopy[action]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
