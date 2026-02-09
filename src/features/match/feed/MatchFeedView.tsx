'use client';

import CandidateCard from '@/components/CandidateCard';
import MatchTabs from '@/components/MatchTabs';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import type { MatchFeedCandidateDTO } from '@/client/api/types';

type MatchFeedViewProps = {
  candidates: MatchFeedCandidateDTO[];
  onLike: (candidate: { id: string; username: string; avatar: string }) => void;
};

export default function MatchFeedView({ candidates, onLike }: MatchFeedViewProps) {
  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-4 lg:p-6">
      <BackBar title="Поиск пары" fallbackHref="/main-menu" />
      <MatchTabs />

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {candidates.map((candidate) => (
          <CandidateCard key={candidate.id} c={candidate} onLike={onLike} />
        ))}
      </div>

      {!candidates.length && (
        <EmptyStateView title="Нет кандидатов" description="Попробуйте обновить список позже." />
      )}
    </div>
  );
}
