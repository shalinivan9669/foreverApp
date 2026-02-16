'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { useInbox } from '@/client/hooks/useInbox';
import type { MatchCardSnapshotVM, MatchLikeVM } from '@/client/viewmodels/match.viewmodels';
import { toMatchLikeVM } from '@/client/viewmodels/match.viewmodels';
import LikeDetailsView from '@/features/match/like/LikeDetailsView';

export default function LikeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: currentUser } = useCurrentUser();
  const {
    fetchLike,
    acceptLike,
    rejectLike,
    confirmLike,
    mutationLoading,
    mutationError,
  } = useInbox({ enabled: false });

  const [like, setLike] = useState<MatchLikeVM | null>(null);
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const loadLike = useCallback(
    async (force = false) => {
      if (!id) return;
      setLoading(true);
      const fresh = await fetchLike(id, force);
      setLoading(false);
      if (!fresh) {
        setLocalError(mutationError?.message ?? 'Не удалось загрузить заявку');
        return;
      }
      setLocalError(null);
      setLike(toMatchLikeVM(fresh));
    },
    [fetchLike, id, mutationError?.message]
  );

  useEffect(() => {
    void loadLike(true);
  }, [loadLike]);

  const iAmInitiator = useMemo(() => {
    if (!currentUser || !like) return false;
    return like.from.id === currentUser.id;
  }, [currentUser, like]);

  const visibleSnapshot = useMemo<MatchCardSnapshotVM | null>(() => {
    if (!like) return null;
    if (iAmInitiator) return like.cardSnapshot ?? null;
    return like.fromCardSnapshot ?? like.recipientResponse?.initiatorCardSnapshot ?? null;
  }, [iAmInitiator, like]);

  const canAcceptReject = useMemo(
    () => iAmInitiator && like?.status === 'awaiting_initiator',
    [iAmInitiator, like]
  );
  const canCreatePair = useMemo(() => iAmInitiator && like?.status === 'mutual_ready', [iAmInitiator, like]);

  const onAccept = async () => {
    if (!like) return;
    const done = await acceptLike({ likeId: like.id });
    if (done) {
      await loadLike(true);
    }
  };

  const onReject = async () => {
    if (!like) return;
    const done = await rejectLike({ likeId: like.id });
    if (done) {
      await loadLike(true);
    }
  };

  const onCreatePair = async () => {
    if (!like) return;
    const done = await confirmLike({ likeId: like.id });
    if (done) {
      router.replace('/couple-activity');
    }
  };

  if (loading && !like) {
    return <LoadingView label="Загружаем детали заявки…" />;
  }

  if (!like && mutationError) {
    return (
      <div className="p-4">
        <ErrorView error={mutationError} onRetry={() => void loadLike(true)} />
      </div>
    );
  }

  if (!like) {
    return (
      <div className="p-4 text-red-600">
        {localError ?? 'Заявка не найдена'}
      </div>
    );
  }

  return (
    <LikeDetailsView
      like={like}
      visibleSnapshot={visibleSnapshot}
      canAcceptReject={canAcceptReject}
      canCreatePair={canCreatePair}
      busy={mutationLoading}
      errorMessage={localError ?? mutationError?.message ?? null}
      onBack={() => router.back()}
      onAccept={() => void onAccept()}
      onReject={() => void onReject()}
      onCreatePair={() => void onCreatePair()}
    />
  );
}
