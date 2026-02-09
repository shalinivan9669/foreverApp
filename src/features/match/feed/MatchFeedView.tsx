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
    <div className="app-shell">
      <main className="space-y-3 pb-4 pt-3 sm:space-y-4 sm:pb-6 sm:pt-4">
        <BackBar title="Поиск пары" fallbackHref="/main-menu" />
        <MatchTabs />

        <div className="px-1">
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Подбор партнеров</h1>
          <p className="app-muted mt-1 text-sm">Выберите тех, с кем хотите продолжить знакомство.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {candidates.map((candidate, index) => (
            <div key={candidate.id} className="app-reveal" style={{ animationDelay: `${Math.min(index * 35, 220)}ms` }}>
              <CandidateCard c={candidate} onLike={onLike} />
            </div>
          ))}
        </div>

        {!candidates.length && (
          <EmptyStateView title="Нет кандидатов" description="Попробуйте обновить список чуть позже." />
        )}
      </main>
    </div>
  );
}
