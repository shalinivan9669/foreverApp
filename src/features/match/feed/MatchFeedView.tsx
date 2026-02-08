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
    <div className="p-4 flex flex-col gap-2">
      <BackBar title="Поиск пары" fallbackHref="/main-menu" />
      <MatchTabs />

      {candidates.map((candidate) => (
        <CandidateCard key={candidate.id} c={candidate} onLike={onLike} />
      ))}

      {!candidates.length && (
        <EmptyStateView title="Нет кандидатов" description="Попробуйте обновить список позже." />
      )}
    </div>
  );
}
