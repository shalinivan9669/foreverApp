'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentUser } from './useCurrentUser';
import { usePair } from './usePair';
import { useRefreshOnReturn } from './useRefreshOnReturn';
import { pairsApi, type PairSummaryDTO } from '@/client/api/pairs.api';
import { weeklyCyclesApi, type CurrentWeeklyCycleDTO } from '@/client/api/weeklyCycles.api';
import { recommendationsApi, type RecommendationDecisionDTO } from '@/client/api/recommendations.api';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
import { selectTodayAction } from '@/client/viewmodels/today.viewmodels';
import { useTodayJourney } from './useTodayJourney';
import { getMatchingEligibility } from '@/lib/contracts/matchingEligibility';

type CycleState = {
  pairId: string | null; summary: PairSummaryDTO | null; cycle: CurrentWeeklyCycleDTO | null;
  recommendation: RecommendationDecisionDTO | null; loading: boolean; error: UiErrorState | null;
};
const emptyCycle: CycleState = { pairId: null, summary: null, cycle: null, recommendation: null, loading: false, error: null };

export function useTodayDashboard() {
  const user = useCurrentUser();
  const pair = usePair();
  const { pairId, pairMe, refetchPair, refetchStatus } = pair;
  const refetchUser = user.refetch;
  const [state, setState] = useState<CycleState>(emptyCycle);
  const [refreshing, setRefreshing] = useState(false);
  const [contextStarted, setContextStarted] = useState(false);
  const request = useRef(0);
  const scopeVersion = useRef(0);
  const refreshLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const pairStatus = pairMe?.pair?.status;
  const contextReady = contextStarted && !user.loading && !user.refreshing && !pair.loading && !user.error && !pair.error;
  const journey = useTodayJourney(user.data, contextReady && !pairId);
  const refreshJourney = journey.refresh;
  const loadCycle = useCallback(async (id: string) => {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const version = ++request.current;
    setState({ ...emptyCycle, pairId: id, loading: true });
    try {
      const [summary, cycle, overview] = await Promise.all([
        pairsApi.getSummary(id, active.signal), weeklyCyclesApi.getCurrent(id, active.signal), recommendationsApi.getOverview(id, active.signal),
      ]);
      if (active.signal.aborted || version !== request.current) return;
      setState({ pairId: id, summary, cycle, recommendation: overview.current, loading: false, error: null });
    } catch (error) {
      if (active.signal.aborted || version !== request.current) return;
      setState({ ...emptyCycle, pairId: id, error: toUiErrorState(error instanceof Error ? error : new Error('Не удалось загрузить текущий шаг.')) });
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    scopeVersion.current += 1;
    queueMicrotask(() => {
      if (cancelled) return;
      // The underlying context hooks start their initial refresh before this task.
      setContextStarted(true);
      if (pairId && pairStatus === 'active') void loadCycle(pairId);
    });
    return () => { cancelled = true; controller.current?.abort(); request.current += 1; scopeVersion.current += 1; };
  }, [pairId, pairStatus, loadCycle]);
  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    const scopeAtStart = scopeVersion.current;
    setRefreshing(true);
    controller.current?.abort();
    request.current += 1;
    setState(emptyCycle);
    try {
      const [freshPair, freshStatus, freshUser] = await Promise.all([refetchPair(), refetchStatus(), refetchUser()]);
      if (scopeAtStart !== scopeVersion.current) return;
      // A changed Pair is loaded by the scope effect; avoid duplicate requests.
      if (freshStatus && freshUser && pairId && freshPair?.pair?.id === pairId && freshPair.pair.status === 'active' && pairStatus === 'active') await loadCycle(pairId);
      if (freshStatus && freshUser && !pairId && !freshPair?.pair) await refreshJourney();
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, [loadCycle, pairId, pairStatus, refetchPair, refetchStatus, refetchUser, refreshJourney]);
  const inScope = state.pairId === pairId && pairStatus === 'active';
  const error = user.error ?? pair.error ?? (inScope ? state.error : null) ?? journey.error;
  const loading = !contextStarted || refreshing || user.loading || user.refreshing || pair.loading || journey.loading || Boolean(pairId && pairStatus === 'active' && (!inScope || state.loading) && !error);
  const ready = !loading && !error && Boolean(user.data);
  const summary = ready && inScope ? state.summary : null;
  const cycle = ready && inScope ? state.cycle : null;
  const existingPartnerIntent = user.data?.entryCohort === 'EXISTING_PARTNER' || user.data?.personal?.relationshipStatus === 'in_relationship';
  const matchingAllowed = ready && getMatchingEligibility({ entryCohort: user.data?.entryCohort, relationshipStatus: user.data?.personal?.relationshipStatus, age: user.data?.personal?.age, hasPair: Boolean(pairId && pairStatus !== 'ended') }) === 'ELIGIBLE';
  useRefreshOnReturn(refresh, !loading);
  return {
    loading, error, refresh, ready, matchingAllowed, pairId: ready ? pairId : null, pairStatus: ready ? pairStatus : null, existingPartnerIntent, summary, cycle,
    action: selectTodayAction({ loading, failed: Boolean(error), userReady: Boolean(user.data), existingPartnerIntent, pairId, pairStatus, summary, cycle, journey: journey.step, recommendation: ready && inScope ? state.recommendation : null }),
  };
}
