'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LikeModal from '@/components/LikeModal';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { useMatchFeed } from '@/client/hooks/useMatchFeed';
import MatchFeedView from '@/features/match/feed/MatchFeedView';

export default function SearchPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ id: string; username: string; avatar: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const { gate, redirectPath, candidates, loading, error, refetch } = useMatchFeed({
    enabled: true,
    preflight: true,
  });

  useEffect(() => {
    if (!redirectPath) return;
    router.replace(redirectPath);
  }, [redirectPath, router]);

  if (gate === 'checking' && loading && candidates.length === 0) {
    return <LoadingView label="Проверяем профиль и подбираем кандидатов..." />;
  }

  if (error && candidates.length === 0) {
    return (
      <div className="app-shell py-3 sm:py-4 lg:py-6">
        <ErrorView error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const visibleCandidates = candidates.filter((candidate) => !hiddenIds.includes(candidate.id));

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
