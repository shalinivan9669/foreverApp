import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pairsApi } from '@/client/api/pairs.api';
import type { PairMeDTO, PairStatusDTO } from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

const STATUS_CACHE_KEY = 'pairs:status:self';
const ME_CACHE_KEY = 'pairs:me:self';

type UsePairOptions = {
  enabled?: boolean;
  statusCacheKey?: string;
  pairCacheKey?: string;
};

export function usePair(options: UsePairOptions = {}) {
  const enabled = options.enabled ?? true;
  const statusKey = options.statusCacheKey ?? STATUS_CACHE_KEY;
  const pairKey = options.pairCacheKey ?? ME_CACHE_KEY;

  const getPairStatus = useEntitiesStore((state) => state.getPairStatus);
  const setPairStatus = useEntitiesStore((state) => state.setPairStatus);
  const getPairMe = useEntitiesStore((state) => state.getPairMe);
  const setPairMe = useEntitiesStore((state) => state.setPairMe);

  const [status, setStatus] = useState<PairStatusDTO | null>(getPairStatus(statusKey));
  const [pairMe, setPairMeState] = useState<PairMeDTO | null>(getPairMe(pairKey));

  const statusAbortRef = useRef<AbortController | null>(null);
  const pairAbortRef = useRef<AbortController | null>(null);
  const statusVersionRef = useRef(0);
  const pairVersionRef = useRef(0);

  const {
    runSafe: runStatusSafe,
    loading: statusLoading,
    error: statusError,
  } = useApi('pair-status');
  const {
    runSafe: runPairSafe,
    loading: pairLoading,
    error: pairError,
  } = useApi('pair-me');

  const refetchStatus = useCallback(async (): Promise<PairStatusDTO | null> => {
    statusVersionRef.current += 1;
    const requestVersion = statusVersionRef.current;

    statusAbortRef.current?.abort();
    const controller = new AbortController();
    statusAbortRef.current = controller;

    const fresh = await runStatusSafe(() => pairsApi.getStatus(controller.signal), {
      loadingKey: 'pair-status',
    });
    if (!fresh || requestVersion !== statusVersionRef.current) return null;

    setPairStatus(statusKey, fresh);
    setStatus(fresh);
    return fresh;
  }, [runStatusSafe, setPairStatus, statusKey]);

  const refetchPair = useCallback(async (): Promise<PairMeDTO | null> => {
    pairVersionRef.current += 1;
    const requestVersion = pairVersionRef.current;

    pairAbortRef.current?.abort();
    const controller = new AbortController();
    pairAbortRef.current = controller;

    const fresh = await runPairSafe(() => pairsApi.getMyPair(controller.signal), {
      loadingKey: 'pair-me',
    });
    if (!fresh || requestVersion !== pairVersionRef.current) return null;

    setPairMe(pairKey, fresh);
    setPairMeState(fresh);
    return fresh;
  }, [pairKey, runPairSafe, setPairMe]);

  const refetch = useCallback(async () => {
    await Promise.all([refetchStatus(), refetchPair()]);
  }, [refetchPair, refetchStatus]);

  useEffect(() => {
    setStatus(getPairStatus(statusKey));
    setPairMeState(getPairMe(pairKey));
  }, [getPairMe, getPairStatus, pairKey, statusKey]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    return () => {
      statusAbortRef.current?.abort();
      pairAbortRef.current?.abort();
    };
  }, [enabled, refetch]);

  const error = statusError ?? pairError;
  const loading = statusLoading || pairLoading;
  const pairId = useMemo(
    () => pairMe?.pair?.id ?? (status?.hasActive ? status.pairId : null),
    [pairMe, status]
  );

  return {
    status,
    pairMe,
    pairId,
    loading,
    error,
    refetch,
    refetchStatus,
    refetchPair,
  };
}
