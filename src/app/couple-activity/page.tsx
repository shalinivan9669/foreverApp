'use client';

import { useCallback, useMemo, useState } from 'react';
import type { UiErrorState } from '@/client/api/errors';
import type { ActivityCompleteResponse } from '@/client/api/types';
import { useActivityOffers } from '@/client/hooks/useActivityOffers';
import { usePair } from '@/client/hooks/usePair';
import { toActivityCardVM, type ActivityCardVM } from '@/client/viewmodels';
import RecommendationDecisionPanel from '@/components/activities/RecommendationDecisionPanel';
import CoupleActivityView from '@/features/activities/CoupleActivityView';
import {
  CONFLICT_RESOLVED_MESSAGE,
  getOrCreateCheckinCompleteAttempt,
  isConflictResolvedByRefetch,
  toCompleteRetryMessage,
  type CheckinCompleteAttempt,
} from '@/features/activities/checkinCompleteFlow';

type Tab = 'active' | 'suggested' | 'history';
type CheckInAnswerInput = Array<{ checkInId: string; ui: number }>;

type PendingCompleteState = {
  activityId: string;
  attempt: CheckinCompleteAttempt;
  error: UiErrorState | null;
};

const toCompletionMessage = (result: ActivityCompleteResponse): string => {
  const summary = result.resultSummary;
  if (summary.status === 'failed') {
    return 'Обратная связь сохранена: этот формат оказался непростым. Точные ответы каждого остаются личными.';
  }
  if (!summary.bothSubmitted) {
    return 'Личный отзыв сохранён. Общий итог останется предварительным до второго ответа.';
  }
  return 'Отзывы обоих участников сохранены. Показан только общий качественный статус.';
};

export default function CoupleActivityPage() {
  const locale = 'ru';
  const [tab, setTab] = useState<Tab>('active');
  const [checkInFor, setCheckInFor] = useState<ActivityCardVM | null>(null);
  const [pendingComplete, setPendingComplete] = useState<PendingCompleteState | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<CheckinCompleteAttempt | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [retryCompleteSubmitting, setRetryCompleteSubmitting] = useState(false);
  const [activityFlowMessage, setActivityFlowMessage] = useState<string | null>(null);

  const { pairId } = usePair();
  const {
    active,
    suggested,
    history,
    loading,
    error,
    refetch,
    suggestNext,
    acceptActivity,
    cancelActivity,
    checkInActivityDetailed,
    completeActivityDetailed,
    clearMutationError,
    suggestionPlan,
    lastSuggestionSkippedReason,
    lastCreatedCount,
  } = useActivityOffers({
    pairId,
    enabled: Boolean(pairId),
  });

  const activeVm = useMemo(() => (active ? toActivityCardVM(active) : null), [active]);
  const suggestedVm = useMemo(() => suggested.map(toActivityCardVM), [suggested]);
  const historyVm = useMemo(() => history.map(toActivityCardVM), [history]);
  const pendingCompleteMessage = useMemo(
    () => toCompleteRetryMessage(pendingComplete?.error ?? null),
    [pendingComplete]
  );

  const handleCompleteFailure = useCallback(
    async (
      activityId: string,
      attempt: CheckinCompleteAttempt,
      error: UiErrorState
    ) => {
      if (isConflictResolvedByRefetch(error)) {
        await refetch();
        setPendingComplete(null);
        setActiveAttempt(null);
        setCheckInFor(null);
        clearMutationError();
        setActivityFlowMessage(CONFLICT_RESOLVED_MESSAGE);
        return;
      }

      setPendingComplete({
        activityId,
        attempt,
        error,
      });
    },
    [clearMutationError, refetch]
  );

  const submitCheckInAndComplete = useCallback(
    async (activityId: string, answers: CheckInAnswerInput) => {
      if (checkInSubmitting || retryCompleteSubmitting) {
        return;
      }

      setActivityFlowMessage(null);
      setPendingComplete(null);
      clearMutationError();
      const attempt = getOrCreateCheckinCompleteAttempt(activeAttempt);
      setActiveAttempt(attempt);

      setCheckInSubmitting(true);
      const checkInResult = await checkInActivityDetailed(
        activityId,
        { answers },
        { idempotencyKey: attempt.checkInKey }
      );

      if (!checkInResult.ok) {
        setCheckInSubmitting(false);
        return;
      }

      const completeResult = await completeActivityDetailed(activityId, {
        idempotencyKey: attempt.completeKey,
      });

      if (completeResult.ok) {
        setPendingComplete(null);
        setActiveAttempt(null);
        setCheckInFor(null);
        clearMutationError();
        setActivityFlowMessage(toCompletionMessage(completeResult.data));
        setCheckInSubmitting(false);
        return;
      }

      await handleCompleteFailure(activityId, attempt, completeResult.error);
      setCheckInSubmitting(false);
    },
    [
      checkInSubmitting,
      retryCompleteSubmitting,
      activeAttempt,
      clearMutationError,
      checkInActivityDetailed,
      completeActivityDetailed,
      handleCompleteFailure,
    ]
  );

  const retryComplete = useCallback(
    async (activityId: string) => {
      if (
        retryCompleteSubmitting ||
        !pendingComplete ||
        pendingComplete.activityId !== activityId
      ) {
        return;
      }

      setActivityFlowMessage(null);
      clearMutationError();
      setRetryCompleteSubmitting(true);

      const completeResult = await completeActivityDetailed(activityId, {
        idempotencyKey: pendingComplete.attempt.completeKey,
      });

      if (completeResult.ok) {
        setPendingComplete(null);
        setActiveAttempt(null);
        setCheckInFor(null);
        clearMutationError();
        setActivityFlowMessage(toCompletionMessage(completeResult.data));
        setRetryCompleteSubmitting(false);
        return;
      }

      await handleCompleteFailure(
        activityId,
        pendingComplete.attempt,
        completeResult.error
      );
      setRetryCompleteSubmitting(false);
    },
    [
      retryCompleteSubmitting,
      pendingComplete,
      setActiveAttempt,
      clearMutationError,
      completeActivityDetailed,
      handleCompleteFailure,
    ]
  );

  return (
    <CoupleActivityView
      tab={tab}
      loading={loading}
      error={error}
      locale={locale}
      active={activeVm}
      suggested={suggestedVm}
      history={historyVm}
      hasPair={Boolean(pairId)}
      onRetry={() => void refetch()}
      onSetTab={setTab}
      onSuggestNext={() => void suggestNext()}
      onAccept={(id) => void acceptActivity(id)}
      onCancel={(id) => void cancelActivity(id)}
      onOpenCheckIn={setCheckInFor}
      checkInFor={checkInFor}
      onCloseCheckIn={() => {
        if (checkInSubmitting || retryCompleteSubmitting) return;
        setCheckInFor(null);
      }}
      checkInSubmitting={checkInSubmitting}
      pendingCompleteActivityId={pendingComplete?.activityId ?? null}
      pendingCompleteMessage={pendingCompleteMessage}
      pendingCompleteInFlight={retryCompleteSubmitting}
      activityFlowMessage={activityFlowMessage}
      recommendationPanel={
        pairId ? (
          <RecommendationDecisionPanel
            pairId={pairId}
            onActivityChanged={() => void refetch()}
          />
        ) : undefined
      }
      suggestionPlan={suggestionPlan}
      lastSuggestionSkippedReason={lastSuggestionSkippedReason}
      lastCreatedCount={lastCreatedCount}
      onRetryComplete={(activityId) => {
        void retryComplete(activityId);
      }}
      onSubmitCheckIn={(activityId, answers) => {
        void submitCheckInAndComplete(activityId, answers);
      }}
    />
  );
}
