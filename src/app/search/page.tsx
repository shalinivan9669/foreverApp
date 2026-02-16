'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LikeModal from '@/components/LikeModal';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { useMatchFeed } from '@/client/hooks/useMatchFeed';
import { toMatchFeedCandidateVMList } from '@/client/viewmodels/match.viewmodels';
import MatchFeedView from '@/features/match/feed/MatchFeedView';

export default function SearchPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const { gate, redirectPath, candidates, loading, error, refetch } = useMatchFeed({
    enabled: true,
    preflight: true,
  });
  const candidateViewModels = useMemo(() => toMatchFeedCandidateVMList(candidates), [candidates]);
  const hiddenIdSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  useEffect(() => {
    if (!redirectPath) return;
    router.replace(redirectPath);
  }, [redirectPath, router]);

  if (gate === 'checking' && loading && candidateViewModels.length === 0) {
    return <LoadingView label="Проверяем профиль и подбираем кандидатов..." />;
  }

  if (error && candidateViewModels.length === 0) {
    return (
      <div className="app-shell py-3 sm:py-4 lg:py-6">
        <ErrorView error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const visibleCandidates = candidateViewModels.filter((candidate) => !hiddenIdSet.has(candidate.id));

  return (
    <>
      <MatchFeedView candidates={visibleCandidates} onLike={setSelected} />

      {error && (
        <div className="app-shell pb-3">
          <ErrorView error={error} onRetry={() => void refetch()} />
        </div>
      )}

      <LikeModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        candidate={selected}
        onSent={({ toId }) => {
          setHiddenIds((current) => (current.includes(toId) ? current : [...current, toId]));
          router.push('/match/inbox');
        }}
      />
    </>
  );
}
