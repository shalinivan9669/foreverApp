import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type CandidateMatchingCardDTO,
  type CreateMatchingLikeRequest,
  type MatchFeedCandidateDTO,
  type MatchLikeDTO,
} from "@/client/api/match.api";
import { useApi } from "./useApi";

export function useMatchFeed() {
  const [items, setItems] = useState<MatchFeedCandidateDTO[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<MatchFeedCandidateDTO | null>(null);
  const [candidateCard, setCandidateCard] =
    useState<CandidateMatchingCardDTO | null>(null);
  const [lastLike, setLastLike] = useState<MatchLikeDTO | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

  const {
    runSafe: runLoadSafe,
    loading: loadLoading,
    error: loadError,
  } = useApi("matching-feed");
  const {
    runSafe: runActionSafe,
    loading: actionLoading,
    error: actionError,
    clearError: clearActionError,
  } = useApi("matching-feed-action");

  const load = useCallback(
    async (cursor?: string): Promise<boolean> => {
      requestVersionRef.current += 1;
      const requestVersion = requestVersionRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const page = await runLoadSafe(
        () => matchApi.getFeed(cursor, 20, controller.signal),
        { suppressGlobalError: true },
      );
      if (!page || requestVersion !== requestVersionRef.current) return false;
      setItems((current) =>
        cursor ? [...(current ?? []), ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
      return true;
    },
    [runLoadSafe],
  );

  const openCandidate = useCallback(
    async (candidate: MatchFeedCandidateDTO): Promise<boolean> => {
      setSelected(candidate);
      setCandidateCard(null);
      const detail = await runActionSafe(
        () =>
          matchApi.getCandidateCard(
            candidate.candidate.id,
            candidate.candidateGrant,
          ),
        { suppressGlobalError: true },
      );
      if (!detail) return false;
      setCandidateCard(detail);
      return true;
    },
    [runActionSafe],
  );

  const closeCandidate = useCallback(() => {
    setSelected(null);
    setCandidateCard(null);
    setLastLike(null);
    clearActionError();
  }, [clearActionError]);

  const createLike = useCallback(
    async (
      input: Omit<CreateMatchingLikeRequest, "candidateId" | "candidateGrant">,
    ): Promise<boolean> => {
      if (!selected) return false;
      const created = await runActionSafe(
        () =>
          matchApi.createLike({
            ...input,
            candidateId: selected.candidate.id,
            candidateGrant: selected.candidateGrant,
          }),
        { suppressGlobalError: true },
      );
      if (!created) return false;
      setLastLike(created);
      setItems(
        (current) =>
          current?.filter(
            (item) => item.candidate.id !== selected.candidate.id,
          ) ?? null,
      );
      return true;
    },
    [runActionSafe, selected],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [load]);

  return {
    items: items ?? [],
    loading: loadLoading || (items === null && loadError === null),
    loadingMore: loadLoading && items !== null,
    actionLoading,
    error: loadError,
    actionError,
    nextCursor,
    selected,
    candidateCard,
    lastLike,
    refetch: () => load(),
    loadMore: () => (nextCursor ? load(nextCursor) : Promise.resolve(false)),
    openCandidate,
    closeCandidate,
    createLike,
  };
}
