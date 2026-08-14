import Link from "next/link";
import type { MatchingConnectionDTO } from "@/client/api/match.api";
import {
  matchingConfirmationCopy,
  matchingConnectionStageLabel,
} from "@/client/viewmodels/matching";
import MatchingAvatar from "./MatchingAvatar";

type MatchingConnectionCardProps = {
  connection: MatchingConnectionDTO;
  loading?: boolean;
  onAction: (
    action: "REQUEST" | "CONFIRM" | "CANCEL",
  ) => Promise<boolean> | void;
};

const actionCopy = {
  REQUEST: "Предложить стать парой",
  CONFIRM: "Подтвердить отношения",
  CANCEL: "Отменить предложение",
} as const;

export default function MatchingConnectionCard({
  connection,
  loading = false,
  onAction,
}: MatchingConnectionCardProps) {
  const confirmation = matchingConfirmationCopy(connection);
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
            {matchingConnectionStageLabel(connection.stage)}
          </p>
        </div>
      </div>

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

      {!connection.pairId && connection.allowedActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {connection.allowedActions.map((action) => (
            <button
              className={
                action === "CANCEL" ? "app-btn-secondary" : "app-btn-primary"
              }
              type="button"
              key={action}
              disabled={loading}
              onClick={() => void onAction(action)}
            >
              {loading ? "Сохраняем…" : actionCopy[action]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
