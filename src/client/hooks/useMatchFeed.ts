import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchApi } from '@/client/api/match.api';
import { pairsApi } from '@/client/api/pairs.api';
import type {
  CandidateMatchCardDTO,
  MatchFeedCandidateDTO,
  MatchLikeCreateRequest,
  MatchLikeCreateResponse,
} from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

const FEED_CACHE_KEY = 'match:feed:self';
const EMPTY_FEED_CANDIDATES: MatchFeedCandidateDTO[] = [];

export type MatchFeedGate = 'checking' | 'ready' | 'redirect_pair' | 'redirect_match_card';

type UseMatchFeedOptions = {
  enabled?: boolean;
  cacheKey?: string;
  preflight?: boolean;
};

export function useMatchFeed(options: UseMatchFeedOptions = {}) {
  const enabled = options.enabled ?? true;
  const cacheKey = options.cacheKey ?? FEED_CACHE_KEY;
  const preflight = options.preflight ?? true;

  const setMatchFeed = useEntitiesStore((state) => state.setMatchFeed);
  const cached = useEntitiesStore(
    (state) => state.matchFeedByKey[cacheKey]?.data ?? null
  );
  const candidates = cached ?? EMPTY_FEED_CANDIDATES;

  const [gateState, setGateState] = useState<{
    cacheKey: string;
    gate: MatchFeedGate;
  }>(() => ({
    cacheKey,
    gate: candidates.length > 0 ? 'ready' : 'checking',
  }));
  const gate =
    gateState.cacheKey === cacheKey
      ? gateState.gate
      : candidates.length > 0
        ? 'ready'
        : 'checking';

  const {
    runSafe: runLoadSafe,
    loading: loading,
    error: error,
  } = useApi('match-feed');
  const {
    runSafe: runMutationSafe,
    loading: mutationLoading,
    error: mutationError,
    clearError: clearMutationError,
  } = useApi('match-feed-mutations');

  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const refetch = useCallback(async (): Promise<MatchFeedCandidateDTO[] | null> => {
    versionRef.current += 1;
    const requestVersion = versionRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGateState({ cacheKey, gate: 'checking' });

    if (preflight) {
      const preflightResult = await runLoadSafe(
        async () => {
          const [pairMe, ownCard] = await Promise.all([
            pairsApi.getMyPair(controller.signal),
            matchApi.getOwnMatchCard(controller.signal),
          ]);
          return { pairMe, ownCard };
        },
        {
          loadingKey: 'match-feed',
          suppressGlobalError: true,
        }
      );

      if (!preflightResult || requestVersion !== versionRef.current) return null;

      if (preflightResult.pairMe.hasActive) {
        setGateState({ cacheKey, gate: 'redirect_pair' });
        return [];
      }
      if (preflightResult.ownCard === null) {
        setGateState({ cacheKey, gate: 'redirect_match_card' });
        return [];
      }
    }

    const fresh = await runLoadSafe(() => matchApi.getFeed(controller.signal), {
      loadingKey: 'match-feed',
    });
    if (!fresh || requestVersion !== versionRef.current) return null;

    const normalized = Array.isArray(fresh) ? fresh : [];
    setMatchFeed(cacheKey, normalized);
    setGateState({ cacheKey, gate: 'ready' });
    return normalized;
  }, [cacheKey, preflight, runLoadSafe, setMatchFeed]);

  const loadCandidateCard = useCallback(
    async (candidateId: string): Promise<CandidateMatchCardDTO | null> => {
      return runMutationSafe(() => matchApi.getCandidateCard(candidateId), {
        loadingKey: 'match-feed-mutations',
      });
    },
    [runMutationSafe]
  );

  const likeCandidate = useCallback(
    async (payload: MatchLikeCreateRequest): Promise<MatchLikeCreateResponse | null> => {
      return runMutationSafe(() => matchApi.createLike(payload), {
        loadingKey: 'match-feed-mutations',
      });
    },
    [runMutationSafe]
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [enabled, refetch]);

  const redirectPath = useMemo(() => {
    if (gate === 'redirect_pair') return '/couple-activity';
    if (gate === 'redirect_match_card') return '/match-card/create';
    return null;
  }, [gate]);

  return {
    gate,
    redirectPath,
    candidates,
    loading,
    error,
    mutationLoading,
    mutationError,
    refetch,
    loadCandidateCard,
    likeCandidate,
    clearMutationError,
  };
}
