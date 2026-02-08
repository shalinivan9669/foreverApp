'use client';

import { useEffect, useMemo, useState } from 'react';
import { matchApi } from '@/client/api/match.api';
import type { CandidateMatchCardDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';
import LikeModalView from '@/components/match/LikeModalView';

type Props = {
  open: boolean;
  onClose: () => void;
  candidate: { id: string; username: string; avatar: string } | null;
  onSent?: (payload: { matchScore: number; toId: string }) => void;
};

export default function LikeModal({ open, onClose, candidate, onSent }: Props) {
  const [card, setCard] = useState<CandidateMatchCardDTO | null>(null);
  const [agree, setAgree] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [answers, setAnswers] = useState<[string, string]>(['', '']);

  const {
    runSafe: loadCard,
    error: loadError,
  } = useApi('like-modal-load');
  const {
    runSafe: submitLike,
    error: mutationError,
    loading: mutationLoading,
  } = useApi('like-modal-submit');

  useEffect(() => {
    if (!open || !candidate) return;
    setCard(null);
    setAgree([false, false, false]);
    setAnswers(['', '']);

    let active = true;
    loadCard(() => matchApi.getCandidateCard(candidate.id), {
        loadingKey: 'like-modal-load',
      })
      .then((freshCard) => {
        if (!active) return;
        setCard(freshCard);
      });

    return () => {
      active = false;
    };
  }, [candidate, loadCard, open]);

  const canSend = useMemo(() => {
    if (!card) return false;
    if (!agree.every(Boolean)) return false;
    const first = answers[0].trim();
    const second = answers[1].trim();
    return first.length > 0 && second.length > 0 && first.length <= 280 && second.length <= 280;
  }, [agree, answers, card]);

  const onToggleAgreement = (index: number, value: boolean) => {
    const next = [...agree] as [boolean, boolean, boolean];
    next[index] = value;
    setAgree(next);
  };

  const onChangeAnswer = (index: number, value: string) => {
    const next = [...answers] as [string, string];
    next[index] = value.slice(0, 280);
    setAnswers(next);
  };

  const onSubmit = async () => {
    if (!candidate || !canSend) return;
    const created = await submitLike(
      () =>
        matchApi.createLike({
          toId: candidate.id,
          agreements: [true, true, true],
          answers,
        }),
      {
        loadingKey: 'like-modal-submit',
      }
    );
    if (!created) return;

    onSent?.({ matchScore: created.matchScore, toId: candidate.id });
    onClose();
  };

  const errorMessage = mutationError?.message ?? loadError?.message ?? null;

  return (
    <LikeModalView
      open={open}
      candidate={candidate}
      card={card}
      agree={agree}
      answers={answers}
      canSend={canSend}
      busy={mutationLoading}
      error={errorMessage}
      onClose={onClose}
      onToggleAgreement={onToggleAgreement}
      onChangeAnswer={onChangeAnswer}
      onSubmit={onSubmit}
    />
  );
}
