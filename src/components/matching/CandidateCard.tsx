import type { MatchFeedCandidateDTO } from "@/client/api/match.api";
import FitSummary from "./FitSummary";
import MatchingAvatar from "./MatchingAvatar";

type CandidateCardProps = {
  candidate: MatchFeedCandidateDTO;
  onOpen: () => void;
  loading?: boolean;
};

export default function CandidateCard({
  candidate,
  onOpen,
  loading = false,
}: CandidateCardProps) {
  return (
    <article className="app-panel app-lift flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <MatchingAvatar
          username={candidate.candidate.username}
          avatar={candidate.candidate.avatar}
        />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">
            {candidate.candidate.username}
          </h2>
          <p className="app-muted text-sm">Карточка знакомства</p>
        </div>
      </div>

      <div className="mt-4">
        <FitSummary fit={candidate.fit} />
      </div>

      <div className="mt-4 flex-1">
        <h3 className="font-semibold">Для меня важно</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {candidate.card.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </div>

      <button
        className="app-btn-primary mt-5 w-full"
        type="button"
        onClick={onOpen}
        disabled={loading}
      >
        {loading ? "Открываем…" : "Открыть карточку"}
      </button>
    </article>
  );
}
