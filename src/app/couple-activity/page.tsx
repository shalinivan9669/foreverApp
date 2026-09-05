'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UiErrorState } from '@/client/api/errors';
import type { ActivityCompleteResponse } from '@/client/api/types';
import { useActivityOffers } from '@/client/hooks/useActivityOffers';
import { usePair } from '@/client/hooks/usePair';
import { useRefreshOnReturn } from '@/client/hooks/useRefreshOnReturn';
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

type Tab = 'active' | 'history';
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
  const router = useRouter();
  const locale = 'ru';
  const [tab, setTab] = useState<Tab>('active');
  const [checkInFor, setCheckInFor] = useState<ActivityCardVM | null>(null);
  const [pendingComplete, setPendingComplete] = useState<PendingCompleteState | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<CheckinCompleteAttempt | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [retryCompleteSubmitting, setRetryCompleteSubmitting] = useState(false);
  const [activityFlowMessage, setActivityFlowMessage] = useState<string | null>(null);

  const {
    pairId,
    pairMe,
    loading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = usePair();
  const {
    active,
    history,
    loading,
    error,
    refetch,
    startActivity,
    cancelActivity,
    checkInActivityDetailed,
    completeActivityDetailed,
    clearMutationError,
  } = useActivityOffers({
    pairId,
    enabled: Boolean(pairId),
  });
  const refreshState = useCallback(async () => {
    await Promise.all([refetchPair(), refetch()]);
  }, [refetchPair, refetch]);
  useRefreshOnReturn(refreshState, !pairLoading && !loading && !checkInFor && !checkInSubmitting && !retryCompleteSubmitting);

  const activeVm = useMemo(() => (active ? toActivityCardVM(active) : null), [active]);
  const historyVm = useMemo(() => history.map(toActivityCardVM), [history]);
  const accessDenied = [pairError, error].some((failure) =>
    failure !== null && [401, 403, 404].includes(failure.status)
  );
  const checkInStillAccessible = checkInFor && (
    activeVm?._id === checkInFor._id || historyVm.some((item) => item._id === checkInFor._id)
  );
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
    async (
      activityId: string,
      answers: CheckInAnswerInput,
      allowPairModelUse: boolean
    ) => {
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
        { answers, allowPairModelUse },
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
      loading={pairLoading || loading}
      error={pairError ?? error}
      locale={locale}
      active={accessDenied ? null : activeVm}
      history={accessDenied ? [] : historyVm}
      hasPair={Boolean(pairId)}
      pairStatus={accessDenied ? null : pairMe?.pair?.status ?? null}
      onRetry={() => void refreshState()}
      onAuthRequired={() => router.push('/')}
      onSetTab={setTab}
      onCancel={(id) => {
        if (!window.confirm('Отменить текущую активность? Она перейдёт в историю, и продолжить её будет нельзя.')) {
          return;
        }
        void cancelActivity(id);
      }}
      onStart={(id) => void startActivity(id)}
      onOpenCheckIn={setCheckInFor}
      checkInFor={accessDenied || pairLoading || loading || !checkInStillAccessible ? null : checkInFor}
      onCloseCheckIn={() => {
        if (checkInSubmitting || retryCompleteSubmitting) return;
        setCheckInFor(null);
      }}
      checkInSubmitting={checkInSubmitting}
      pendingCompleteActivityId={accessDenied ? null : pendingComplete?.activityId ?? null}
      pendingCompleteMessage={pendingCompleteMessage}
      pendingCompleteInFlight={retryCompleteSubmitting}
      activityFlowMessage={activityFlowMessage}
      recommendationPanel={
        pairId && pairMe?.pair?.status === 'active' && !pairError && !accessDenied ? (
          <RecommendationDecisionPanel
            pairId={pairId}
            onActivityChanged={() => void refetch()}
          />
        ) : undefined
      }
      onRetryComplete={(activityId) => {
        void retryComplete(activityId);
      }}
      onSubmitCheckIn={(activityId, answers, allowPairModelUse) => {
        void submitCheckInAndComplete(activityId, answers, allowPairModelUse);
      }}
    />
  );
}
