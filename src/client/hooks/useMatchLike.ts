import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type MatchLikeDTO,
  type RespondMatchingLikeRequest,
} from "@/client/api/match.api";
import { useApi } from "./useApi";

export function useMatchLike(likeId: string) {
  const [like, setLike] = useState<MatchLikeDTO | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const {
    runSafe: runLoadSafe,
    loading: loadLoading,
    error: loadError,
  } = useApi("matching-like");
  const {
    runSafe: runActionSafe,
    loading: actionLoading,
    error: actionError,
  } = useApi("matching-like-action");

  const refetch = useCallback(async (): Promise<boolean> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await runLoadSafe(
      () => matchApi.getLike(likeId, controller.signal),
      { suppressGlobalError: true },
    );
    if (!result || controller.signal.aborted) return false;
    setLike(result);
    return true;
  }, [likeId, runLoadSafe]);

  const runLikeMutation = useCallback(
    async (operation: () => Promise<MatchLikeDTO>): Promise<boolean> => {
      const updated = await runActionSafe(operation, {
        suppressGlobalError: true,
      });
      if (!updated) return false;
      setLike(updated);
      return true;
    },
    [runActionSafe],
  );

  const respond = useCallback(
    (input: Omit<RespondMatchingLikeRequest, "likeId">): Promise<boolean> =>
      runLikeMutation(() => matchApi.respond({ ...input, likeId })),
    [likeId, runLikeMutation],
  );

  const accept = useCallback(
    (): Promise<boolean> => runLikeMutation(() => matchApi.accept(likeId)),
    [likeId, runLikeMutation],
  );

  const withdraw = useCallback((): Promise<boolean> => runLikeMutation(() => matchApi.withdraw(likeId)), [likeId, runLikeMutation]);

  const reject = useCallback(
    (): Promise<boolean> => runLikeMutation(() => matchApi.reject(likeId)),
    [likeId, runLikeMutation],
  );

  const block = useCallback(async (): Promise<boolean> => {
    if (!like) return false;
    const result = await runActionSafe(() => matchApi.block(like.peer.id), {
      suppressGlobalError: true,
    });
    if (!result) return false;
    setLike((current) =>
      current ? { ...current, status: "BLOCKED", allowedActions: [] } : current,
    );
    return true;
  }, [like, runActionSafe]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [refetch]);

  return {
    like,
    loading: loadLoading || (like === null && loadError === null),
    actionLoading,
    error: loadError ?? actionError,
    refetch,
    respond,
    accept,
    reject,
    withdraw,
    block,
  };
}
