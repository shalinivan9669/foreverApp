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

  const setCurrentUser = useEntitiesStore((state) => state.setCurrentUser);
  const data = useEntitiesStore(
    (state) => state.currentUserByKey[cacheKey]?.data ?? null
  );

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
    if (requestVersion === versionRef.current) setIsRefreshing(false);

    if (!fresh || controller.signal.aborted || requestVersion !== versionRef.current) {
      return null;
    }

    setCurrentUser(cacheKey, fresh);
    return fresh;
  }, [cacheKey, runSafe, setCurrentUser]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (enabled && !cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      versionRef.current += 1;
    };
  }, [enabled, refetch]);

  const hasData = useMemo(() => Boolean(data), [data]);

  return {
    data,
    loading: enabled && !hasData && (loading || isRefreshing || error === null),
    refreshing: isRefreshing,
    error,
    refetch,
    clearError,
  };
}
