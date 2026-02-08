import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activitiesApi } from '@/client/api/activities.api';
import type {
  ActivityCheckInRequest,
  ActivityOfferDTO,
  PairActivityDTO,
} from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

type UseActivityOffersOptions = {
  pairId: string | null;
  enabled?: boolean;
};

type ActivityBuckets = {
  active: PairActivityDTO | null;
  suggested: PairActivityDTO[];
  history: PairActivityDTO[];
};

const makeKey = (pairId: string, bucket: 'current' | 'suggested' | 'history'): string =>
  `pair-activities:${pairId}:${bucket}`;

const toActivityId = (activity: PairActivityDTO): string => activity._id ?? activity.id;

const toBuckets = (
  current: PairActivityDTO[],
  suggested: PairActivityDTO[],
  history: PairActivityDTO[]
): ActivityBuckets => ({
  active: current[0] ?? null,
  suggested,
  history,
});

export function useActivityOffers(options: UseActivityOffersOptions) {
  const pairId = options.pairId;
  const enabled = options.enabled ?? true;

  const getActivitiesList = useEntitiesStore((state) => state.getActivitiesList);
  const setActivitiesList = useEntitiesStore((state) => state.setActivitiesList);

  const initialBuckets = useMemo<ActivityBuckets>(() => {
    if (!pairId) return { active: null, suggested: [], history: [] };
    const current = getActivitiesList(makeKey(pairId, 'current')) ?? [];
    const suggested = getActivitiesList(makeKey(pairId, 'suggested')) ?? [];
    const history = getActivitiesList(makeKey(pairId, 'history')) ?? [];
    return toBuckets(current, suggested, history);
  }, [getActivitiesList, pairId]);

  const [buckets, setBuckets] = useState<ActivityBuckets>(initialBuckets);
  const [lastOfferBatch, setLastOfferBatch] = useState<ActivityOfferDTO[]>([]);

  const {
    runSafe: runLoadSafe,
    loading,
    error: loadError,
  } = useApi('pair-activities');
  const {
    runSafe: runMutationSafe,
    loading: mutationLoading,
    error: mutationError,
    clearError: clearMutationError,
  } = useApi('pair-activities-mutations');

  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const refetch = useCallback(async (): Promise<ActivityBuckets | null> => {
    if (!pairId) return null;

    versionRef.current += 1;
    const requestVersion = versionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fresh = await runLoadSafe(async () => {
      const [current, suggested, history] = await Promise.all([
        activitiesApi.getPairActivities(pairId, 'current', controller.signal),
        activitiesApi.getPairActivities(pairId, 'suggested', controller.signal),
        activitiesApi.getPairActivities(pairId, 'history', controller.signal),
      ]);
      return {
        current: Array.isArray(current) ? current : [],
        suggested: Array.isArray(suggested) ? suggested : [],
        history: Array.isArray(history) ? history : [],
      };
    });
    if (!fresh || requestVersion !== versionRef.current) return null;

    setActivitiesList(makeKey(pairId, 'current'), fresh.current);
    setActivitiesList(makeKey(pairId, 'suggested'), fresh.suggested);
    setActivitiesList(makeKey(pairId, 'history'), fresh.history);

    const nextBuckets = toBuckets(fresh.current, fresh.suggested, fresh.history);
    setBuckets(nextBuckets);
    return nextBuckets;
  }, [pairId, runLoadSafe, setActivitiesList]);

  const suggestNext = useCallback(async (): Promise<boolean> => {
    if (!pairId) return false;
    const offers = await runMutationSafe(() => activitiesApi.suggestPairActivities(pairId));
    if (!offers) return false;
    setLastOfferBatch(offers);
    await refetch();
    return true;
  }, [pairId, refetch, runMutationSafe]);

  const createFromTemplate = useCallback(
    async (templateId: string): Promise<boolean> => {
      if (!pairId) return false;
      const created = await runMutationSafe(() =>
        activitiesApi.createFromTemplate(pairId, { templateId })
      );
      if (!created) return false;
      await refetch();
      return true;
    },
    [pairId, refetch, runMutationSafe]
  );

  const requestPersonalNext = useCallback(async (): Promise<boolean> => {
    const next = await runMutationSafe(() => activitiesApi.createNextActivity());
    return Boolean(next);
  }, [runMutationSafe]);

  const acceptActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      const done = await runMutationSafe(() => activitiesApi.acceptActivity(activityId));
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const cancelActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      const done = await runMutationSafe(() => activitiesApi.cancelActivity(activityId));
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const checkInActivity = useCallback(
    async (activityId: string, payload: ActivityCheckInRequest): Promise<boolean> => {
      const done = await runMutationSafe(() => activitiesApi.checkInActivity(activityId, payload));
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const completeActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      const done = await runMutationSafe(() => activitiesApi.completeActivity(activityId));
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  useEffect(() => {
    if (!pairId) {
      setBuckets({ active: null, suggested: [], history: [] });
      return;
    }
    const current = getActivitiesList(makeKey(pairId, 'current')) ?? [];
    const suggested = getActivitiesList(makeKey(pairId, 'suggested')) ?? [];
    const history = getActivitiesList(makeKey(pairId, 'history')) ?? [];
    setBuckets(toBuckets(current, suggested, history));
  }, [getActivitiesList, pairId]);

  useEffect(() => {
    if (!enabled || !pairId) return;
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, pairId, refetch]);

  const activeId = useMemo(() => (buckets.active ? toActivityId(buckets.active) : null), [buckets.active]);
  const error = loadError ?? mutationError;

  return {
    active: buckets.active,
    activeId,
    suggested: buckets.suggested,
    history: buckets.history,
    loading,
    error,
    mutationLoading,
    mutationError,
    lastOfferBatch,
    refetch,
    suggestNext,
    createFromTemplate,
    requestPersonalNext,
    acceptActivity,
    cancelActivity,
    checkInActivity,
    completeActivity,
    clearMutationError,
  };
}
