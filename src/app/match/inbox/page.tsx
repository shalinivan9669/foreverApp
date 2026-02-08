'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingView from '@/components/ui/LoadingView';
import type { MatchLikeDTO } from '@/client/api/types';
import { useInbox } from '@/client/hooks/useInbox';
import MatchInboxView from '@/features/match/inbox/MatchInboxView';

export default function InboxPage() {
  const router = useRouter();
  const {
    rows,
    incoming,
    outgoing,
    loading,
    error,
    mutationLoading,
    mutationError,
    refetch,
    fetchLike,
    respondToLike,
    acceptLike,
    rejectLike,
    confirmLike,
  } = useInbox();

  const [respondLikeId, setRespondLikeId] = useState<string | null>(null);
  const [respondLike, setRespondLike] = useState<MatchLikeDTO | null>(null);
  const [agreements, setAgreements] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [answers, setAnswers] = useState<[string, string]>(['', '']);
  const [respondError, setRespondError] = useState<string | null>(null);

  const openRespondModal = async (likeId: string) => {
    const details = await fetchLike(likeId, true);
    if (!details) return;
    setRespondLikeId(likeId);
    setRespondLike(details);
    setAgreements([false, false, false]);
    setAnswers(['', '']);
    setRespondError(null);
  };

  const onOpenIncoming = async (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (!row) return;

    if (row.direction === 'incoming' && (row.status === 'sent' || row.status === 'viewed')) {
      await openRespondModal(id);
      return;
    }

    router.push(`/match/like/${id}`);
  };

  const onOpenOutgoing = (id: string) => {
    router.push(`/match/like/${id}`);
  };

  const onToggleAgreement = (index: number, checked: boolean) => {
    const next = [...agreements] as [boolean, boolean, boolean];
    next[index] = checked;
    setAgreements(next);
  };

  const onChangeAnswer = (index: number, value: string) => {
    const next = [...answers] as [string, string];
    next[index] = value.slice(0, 280);
    setAnswers(next);
  };

  const canSubmitResponse = useMemo(() => {
    const first = answers[0].trim();
    const second = answers[1].trim();
    return agreements.every(Boolean) && first.length > 0 && second.length > 0;
  }, [agreements, answers]);

  const onSubmitResponse = async () => {
    if (!respondLikeId || !canSubmitResponse) return;
    const done = await respondToLike({
      likeId: respondLikeId,
      agreements: [true, true, true],
      answers,
    });
    if (!done) {
      setRespondError(mutationError?.message ?? 'Не удалось отправить ответ');
      return;
    }

    setRespondLikeId(null);
    setRespondLike(null);
    setRespondError(null);
  };

  const onAccept = (id: string) => {
    void acceptLike({ likeId: id });
  };

  const onReject = (id: string) => {
    void rejectLike({ likeId: id });
  };

  const onCreatePair = async (id: string) => {
    const done = await confirmLike({ likeId: id });
    if (done) {
      router.replace('/couple-activity');
    }
  };

  if (loading && rows.length === 0) {
    return <LoadingView label="Загружаем входящие и исходящие…" />;
  }

  return (
    <MatchInboxView
      incoming={incoming}
      outgoing={outgoing}
      loading={loading}
      error={error}
      onRefresh={() => void refetch()}
      onOpenIncoming={(id) => void onOpenIncoming(id)}
      onOpenOutgoing={onOpenOutgoing}
      onAccept={onAccept}
      onReject={onReject}
      onCreatePair={(id) => void onCreatePair(id)}
      respondModal={{
        open: Boolean(respondLikeId && respondLike),
        like: respondLike,
        agreements,
        answers,
        canSubmit: canSubmitResponse,
        busy: mutationLoading,
        error: respondError ?? mutationError?.message ?? null,
      }}
      onCloseRespondModal={() => {
        setRespondLikeId(null);
        setRespondLike(null);
        setRespondError(null);
      }}
      onToggleAgreement={onToggleAgreement}
      onChangeAnswer={onChangeAnswer}
      onSubmitResponse={() => void onSubmitResponse()}
    />
  );
}
