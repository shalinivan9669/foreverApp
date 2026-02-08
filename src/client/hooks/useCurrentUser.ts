import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usersApi } from '@/client/api/users.api';
import type { CurrentUserDTO } from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

const DEFAULT_CACHE_KEY = 'users:me';

type UseCurrentUserOptions = {
  enabled?: boolean;
  cacheKey?: string;
};

export function useCurrentUser(options: UseCurrentUserOptions = {}) {
  const cacheKey = options.cacheKey ?? DEFAULT_CACHE_KEY;
  const enabled = options.enabled ?? true;

  const getCached = useEntitiesStore((state) => state.getCurrentUser);
  const setCurrentUser = useEntitiesStore((state) => state.setCurrentUser);
  const cached = getCached(cacheKey);

  const [data, setData] = useState<CurrentUserDTO | null>(cached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const { loading, error, runSafe, clearError } = useApi('current-user');

  const refetch = useCallback(async (): Promise<CurrentUserDTO | null> => {
    versionRef.current += 1;
    const requestVersion = versionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRefreshing(true);
    const fresh = await runSafe(() => usersApi.getCurrentUser(controller.signal), {
      loadingKey: 'current-user',
    });
    setIsRefreshing(false);

    if (!fresh || requestVersion !== versionRef.current) {
      return null;
    }

    setCurrentUser(cacheKey, fresh);
    setData(fresh);
    return fresh;
  }, [cacheKey, runSafe, setCurrentUser]);

  useEffect(() => {
    setData(cached);
  }, [cached]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refetch]);

  const hasData = useMemo(() => Boolean(data), [data]);

  return {
    data,
    loading: loading && !hasData,
    refreshing: isRefreshing,
    error,
    refetch,
    clearError,
  };
}
