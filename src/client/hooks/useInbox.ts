import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchApi } from '@/client/api/match.api';
import type {
  MatchDecisionRequest,
  MatchInboxRowDTO,
  MatchLikeDTO,
  MatchRespondRequest,
} from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

const INBOX_CACHE_KEY = 'match:inbox:self';

type UseInboxOptions = {
  enabled?: boolean;
  cacheKey?: string;
};

export function useInbox(options: UseInboxOptions = {}) {
  const enabled = options.enabled ?? true;
  const cacheKey = options.cacheKey ?? INBOX_CACHE_KEY;

  const getInbox = useEntitiesStore((state) => state.getInbox);
  const setInbox = useEntitiesStore((state) => state.setInbox);
  const setLikes = useEntitiesStore((state) => state.setLikes);
  const likesById = useEntitiesStore((state) => state.likesById);

  const [rows, setRows] = useState<MatchInboxRowDTO[]>(getInbox(cacheKey) ?? []);

  const {
    runSafe: runLoadSafe,
    loading,
    error: loadError,
  } = useApi('match-inbox');
  const {
    runSafe: runMutationSafe,
    loading: mutationLoading,
    error: mutationError,
    clearError: clearMutationError,
  } = useApi('match-inbox-mutations');

  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const refetch = useCallback(async (): Promise<MatchInboxRowDTO[] | null> => {
    versionRef.current += 1;
    const requestVersion = versionRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fresh = await runLoadSafe(() => matchApi.getInbox(controller.signal), {
      loadingKey: 'match-inbox',
    });
    if (!fresh || requestVersion !== versionRef.current) return null;

    const normalized = Array.isArray(fresh) ? fresh : [];
    setInbox(cacheKey, normalized);
    setRows(normalized);
    return normalized;
  }, [cacheKey, runLoadSafe, setInbox]);

  const fetchLike = useCallback(
    async (likeId: string, force = false): Promise<MatchLikeDTO | null> => {
      if (!force) {
        const cachedLike = likesById[likeId];
        if (cachedLike) return cachedLike;
      }

      const fresh = await runMutationSafe(() => matchApi.getLike(likeId), {
        loadingKey: 'match-inbox-mutations',
      });
      if (!fresh) return null;

      setLikes([fresh]);
      return fresh;
    },
    [likesById, runMutationSafe, setLikes]
  );

  const respondToLike = useCallback(
    async (payload: MatchRespondRequest): Promise<boolean> => {
      const done = await runMutationSafe(() => matchApi.respondToLike(payload), {
        loadingKey: 'match-inbox-mutations',
      });
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const acceptLike = useCallback(
    async (payload: MatchDecisionRequest): Promise<boolean> => {
      const done = await runMutationSafe(() => matchApi.acceptLike(payload), {
        loadingKey: 'match-inbox-mutations',
      });
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const rejectLike = useCallback(
    async (payload: MatchDecisionRequest): Promise<boolean> => {
      const done = await runMutationSafe(() => matchApi.rejectLike(payload), {
        loadingKey: 'match-inbox-mutations',
      });
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  const confirmLike = useCallback(
    async (payload: MatchDecisionRequest): Promise<boolean> => {
      const done = await runMutationSafe(() => matchApi.confirmLike(payload), {
        loadingKey: 'match-inbox-mutations',
      });
      if (!done) return false;
      await refetch();
      return true;
    },
    [refetch, runMutationSafe]
  );

  useEffect(() => {
    const cached = getInbox(cacheKey);
    setRows(cached ?? []);
  }, [cacheKey, getInbox]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refetch]);

  const incoming = useMemo(() => rows.filter((row) => row.direction === 'incoming'), [rows]);
  const outgoing = useMemo(() => rows.filter((row) => row.direction === 'outgoing'), [rows]);
  const error = loadError ?? mutationError;

  return {
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
    clearMutationError,
  };
}
