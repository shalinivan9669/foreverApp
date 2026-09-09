'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingView from '@/components/ui/LoadingView';
import { activitiesApi } from '@/client/api/activities.api';
import { resolveActivityNotificationTarget } from '@/client/viewmodels/notificationTargets';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
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
  return <Suspense fallback={<LoadingView label="Открываем активность..." />}><CoupleActivityRoute /></Suspense>;
}

function CoupleActivityRoute() {
  const params = useSearchParams();
  return <CoupleActivitySession key={params.toString()} />;
}

function CoupleActivitySession() {
  const router = useRouter();
  const params = useSearchParams();
  const targetPairId = params.get('pairId');
  const targetActivityId = params.get('activityId');
  const targetDecisionId = params.get('decisionId');
  const targetAction = params.get('action');
  const targetKey = params.toString();
  const locale = 'ru';
  const [tab, setTab] = useState<Tab>('active');
  const [checkInFor, setCheckInFor] = useState<ActivityCardVM | null>(null);
  const [pendingComplete, setPendingComplete] = useState<PendingCompleteState | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<CheckinCompleteAttempt | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [retryCompleteSubmitting, setRetryCompleteSubmitting] = useState(false);
  const [activityFlowMessage, setActivityFlowMessage] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<UiErrorState | null>(null);
  const [resolvedActivity, setResolvedActivity] = useState<{ pairId: string; activity: ActivityCardVM | null } | null>(null);

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
  const accessDenied = [pairError, error, targetError].some((failure) =>
    failure !== null && [401, 403, 404].includes(failure.status)
  );
  const targetPairMismatch = Boolean(targetPairId && pairId && targetPairId !== pairId);
  const targetedActivity = resolvedActivity?.pairId === pairId ? resolvedActivity.activity : null;
  const awaitingTarget = Boolean(targetActivityId && pairId && !targetPairMismatch && pairMe?.pair?.status === 'active' && resolvedActivity?.pairId !== pairId && !targetError);
  const displayedActive = targetedActivity && !targetedActivity.isHistory ? targetedActivity : activeVm;
  const displayedHistory = targetedActivity?.isHistory ? [targetedActivity, ...historyVm.filter((item) => item._id !== targetedActivity._id)] : historyVm;
  useEffect(() => {
    if (pairLoading || loading || error || pairError || !targetActivityId) return;
    const controller = new AbortController();
    if (!pairId || targetPairMismatch || pairMe?.pair?.status !== 'active') {
      return;
    }
    void (async () => {
      try {
        const loadedActivity = await activitiesApi.getPairActivity(pairId, targetActivityId, controller.signal);
        if (controller.signal.aborted) return;
        setTargetError(null);
        const activity = loadedActivity ? toActivityCardVM(loadedActivity) : null;
        setResolvedActivity({ pairId, activity });
        const resolved = resolveActivityNotificationTarget({
          action: targetAction,
          activity,
          feedbackSubmitted: activity?.feedbackSubmitted,
        });
        setTab(resolved.tab);
        setActivityFlowMessage(resolved.message);
        setCheckInFor(resolved.openFeedback ? activity : null);
        requestAnimationFrame(() => {
          const target = document.getElementById(`activity-${targetActivityId}`);
          target?.scrollIntoView({ block: 'start' });
          target?.focus({ preventScroll: true });
        });
      } catch (failure) {
        if (!controller.signal.aborted) {
          setTargetError(toUiErrorState(failure instanceof Error ? failure : new Error('Не удалось проверить отзыв.')));
          setActivityFlowMessage('Не удалось проверить, сохранён ли ваш отзыв. Обновите состояние и повторите переход.');
        }
      }
    })();
    return () => controller.abort();
  }, [pairLoading, loading, error, pairError, pairId, pairMe?.pair?.status, targetPairMismatch, targetActivityId, targetAction, targetKey]);

  const showActivityResult = useCallback((activityId: string) => {
    const next = new URLSearchParams();
    if (pairId) next.set('pairId', pairId);
    next.set('activityId', activityId);
    next.set('action', 'result');
    router.replace(`/couple-activity?${next.toString()}`, { scroll: false });
  }, [pairId, router]);
  const checkInStillAccessible = checkInFor && (
    displayedActive?._id === checkInFor._id || displayedHistory.some((item) => item._id === checkInFor._id)
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
        showActivityResult(activityId);
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
      showActivityResult,
    ]
  );

  const retryComplete = useCallback(
    async (activityId: string, savedFeedbackAttempt?: CheckinCompleteAttempt) => {
      const completion = savedFeedbackAttempt ? { activityId, attempt: savedFeedbackAttempt } : pendingComplete;
      if (
        retryCompleteSubmitting ||
        !completion ||
        completion.activityId !== activityId
      ) {
        return;
      }

      setActivityFlowMessage(null);
      clearMutationError();
      setRetryCompleteSubmitting(true);

      const completeResult = await completeActivityDetailed(activityId, {
        idempotencyKey: completion.attempt.completeKey,
      });

      if (completeResult.ok) {
        setPendingComplete(null);
        setActiveAttempt(null);
        setCheckInFor(null);
        clearMutationError();
        setActivityFlowMessage(toCompletionMessage(completeResult.data));
        showActivityResult(activityId);
        setRetryCompleteSubmitting(false);
        return;
      }

      await handleCompleteFailure(
        activityId,
        completion.attempt,
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
      showActivityResult,
    ]
  );

  return (
    <CoupleActivityView
      tab={tab}
      loading={pairLoading || loading || awaitingTarget}
      error={pairError ?? error ?? targetError}
      locale={locale}
      active={accessDenied || targetPairMismatch ? null : displayedActive}
      history={accessDenied || targetPairMismatch ? [] : displayedHistory}
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
      onOpenCheckIn={(activity) => {
        if (activity.feedbackSubmitted) {
          void retryComplete(activity._id, getOrCreateCheckinCompleteAttempt(null));
          return;
        }
        setActiveAttempt(null);
        setPendingComplete(null);
        setCheckInFor(activity);
      }}
      checkInFor={accessDenied || pairLoading || loading || !checkInStillAccessible ? null : checkInFor}
      onCloseCheckIn={() => {
        if (checkInSubmitting || retryCompleteSubmitting) return;
        setCheckInFor(null);
        if (targetActivityId) showActivityResult(targetActivityId);
      }}
      checkInSubmitting={checkInSubmitting}
      pendingCompleteActivityId={accessDenied ? null : pendingComplete?.activityId ?? null}
      pendingCompleteMessage={pendingCompleteMessage}
      pendingCompleteInFlight={retryCompleteSubmitting}
      activityFlowMessage={targetPairMismatch ? 'Уведомление относится к другой паре. Откройте актуальное состояние с главной страницы.' : activityFlowMessage}
      recommendationPanel={
        pairId && pairMe?.pair?.status === 'active' && !pairError && !accessDenied && !targetPairMismatch ? (
          <RecommendationDecisionPanel
            pairId={pairId}
            targetDecisionId={targetDecisionId}
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
