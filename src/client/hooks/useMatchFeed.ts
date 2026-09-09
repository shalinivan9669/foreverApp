import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type CandidateMatchingCardDTO,
  type CreateMatchingLikeRequest,
  type MatchFeedCandidateDTO,
  type MatchLikeDTO,
} from "@/client/api/match.api";
import { useApi } from "./useApi";
import { ApiClientError } from "@/client/api/errors";

export function useMatchFeed() {
  const [items, setItems] = useState<MatchFeedCandidateDTO[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<MatchFeedCandidateDTO | null>(null);
  const [candidateCard, setCandidateCard] =
    useState<CandidateMatchingCardDTO | null>(null);
  const [lastLike, setLastLike] = useState<MatchLikeDTO | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const candidateAbortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const candidateVersionRef = useRef(0);
  const mutationPendingRef = useRef(false);

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

  const invalidateAccess = useCallback((candidateId?: string) => {
    candidateVersionRef.current += 1;
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    candidateAbortRef.current?.abort();
    setSelected(null);
    setCandidateCard(null);
    setLastLike(null);
    setItems((current) => candidateId ? current?.filter((item) => item.candidate.id !== candidateId) ?? null : []);
    if (!candidateId) setNextCursor(undefined);
  }, []);

  const load = useCallback(
    async (cursor?: string): Promise<boolean> => {
      requestVersionRef.current += 1;
      const requestVersion = requestVersionRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const page = await runLoadSafe(
        async () => {
          try { return await matchApi.getFeed(cursor, 20, controller.signal); }
          catch (error) {
            if (!controller.signal.aborted && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ['MATCHING_BLOCKED', 'MATCHING_SOLO_REQUIRED'].includes(error.code))) invalidateAccess();
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      if (!page || requestVersion !== requestVersionRef.current) return false;
      setItems((current) =>
        cursor ? [...(current ?? []), ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
      return true;
    },
    [runLoadSafe, invalidateAccess],
  );

  const openCandidate = useCallback(
    async (candidate: MatchFeedCandidateDTO): Promise<boolean> => {
      if (mutationPendingRef.current) return false;
      const version = ++candidateVersionRef.current;
      candidateAbortRef.current?.abort();
      const controller = new AbortController();
      candidateAbortRef.current = controller;
      clearActionError();
      setSelected(candidate);
      setCandidateCard(null);
      const detail = await runActionSafe(
        async () => {
          try { return await matchApi.getCandidateCard(
            candidate.candidate.id,
            candidate.candidateGrant,
            controller.signal,
          ); } catch (error) {
            if (controller.signal.aborted || version !== candidateVersionRef.current) throw new DOMException('Candidate request superseded', 'AbortError');
            if (version === candidateVersionRef.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ['MATCHING_BLOCKED', 'MATCHING_SOLO_REQUIRED'].includes(error.code))) invalidateAccess(error.status === 401 || error.code === "MATCHING_SOLO_REQUIRED" ? undefined : candidate.candidate.id);
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      if (!detail || version !== candidateVersionRef.current) return false;
      setCandidateCard(detail);
      return true;
    },
    [runActionSafe, clearActionError, invalidateAccess],
  );

  const closeCandidate = useCallback(() => {
    if (mutationPendingRef.current) return;
    candidateVersionRef.current += 1;
    candidateAbortRef.current?.abort();
    setSelected(null);
    setCandidateCard(null);
    setLastLike(null);
    clearActionError();
  }, [clearActionError]);

  const createLike = useCallback(
    async (
      input: Omit<CreateMatchingLikeRequest, "candidateId" | "candidateGrant">,
      idempotencyKey?: string,
    ): Promise<boolean> => {
      if (!selected || mutationPendingRef.current) return false;
      mutationPendingRef.current = true;
      setMutationLoading(true);
      const version = candidateVersionRef.current;
      const created = await runActionSafe(
        async () => {
          try { return await matchApi.createLike({
            ...input,
            candidateId: selected.candidate.id,
            candidateGrant: selected.candidateGrant,
          }, { idempotencyKey }); }
          catch (error) {
            if (version === candidateVersionRef.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ['MATCHING_BLOCKED', 'MATCHING_SOLO_REQUIRED'].includes(error.code))) invalidateAccess(error.status === 401 || error.code === "MATCHING_SOLO_REQUIRED" ? undefined : selected.candidate.id);
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      mutationPendingRef.current = false;
      setMutationLoading(false);
      if (!created || version !== candidateVersionRef.current) return false;
      setLastLike(created);
      setItems(
        (current) =>
          current?.filter(
            (item) => item.candidate.id !== selected.candidate.id,
          ) ?? null,
      );
      return true;
    },
    [runActionSafe, selected, invalidateAccess],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      candidateAbortRef.current?.abort();
      candidateVersionRef.current += 1;
      requestVersionRef.current += 1;
    };
  }, [load]);

  return {
    items: items ?? [],
    loading: loadLoading || (items === null && loadError === null),
    loadingMore: loadLoading && items !== null,
    actionLoading,
    mutationLoading,
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
