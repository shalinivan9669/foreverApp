import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type MatchLikeDTO,
  type RespondMatchingLikeRequest,
} from "@/client/api/match.api";
import { useApi } from "./useApi";
import { ApiClientError } from "@/client/api/errors";

export function useMatchLike(likeId: string) {
  const [like, setLike] = useState<MatchLikeDTO | null>(null);
  const [actionScope, setActionScope] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutationLock = useRef<string | null>(null);
  const versionRef = useRef(0);
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
    if (mutationLock.current === likeId) return false;
    const version = ++versionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await runLoadSafe(
      async () => {
        try { return await matchApi.getLike(likeId, controller.signal); }
        catch (error) { if (version === versionRef.current && !controller.signal.aborted && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ['MATCHING_BLOCKED', 'MATCHING_SOLO_REQUIRED'].includes(error.code))) setLike(null); throw error; }
      },
      { suppressGlobalError: true },
    );
    if (!result || controller.signal.aborted || version !== versionRef.current) return false;
    setLike(result);
    return true;
  }, [likeId, runLoadSafe]);

  const runLikeMutation = useCallback(
    async (operation: () => Promise<MatchLikeDTO>): Promise<boolean> => {
      if (mutationLock.current === likeId) return false;
      mutationLock.current = likeId;
      setActionScope(likeId);
      const version = ++versionRef.current;
      abortRef.current?.abort();
      const updated = await runActionSafe(async () => {
        try { return await operation(); }
        catch (error) { if (version === versionRef.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ['MATCHING_BLOCKED', 'MATCHING_SOLO_REQUIRED'].includes(error.code))) setLike(null); throw error; }
      }, {
        suppressGlobalError: true,
      });
      if (mutationLock.current === likeId) mutationLock.current = null;
      if (!updated || version !== versionRef.current) return false;
      setLike(updated);
      return true;
    },
    [likeId, runActionSafe],
  );

  const respond = useCallback(
    (input: Omit<RespondMatchingLikeRequest, "likeId">, idempotencyKey?: string): Promise<boolean> =>
      runLikeMutation(() => matchApi.respond({ ...input, likeId }, { idempotencyKey })),
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
    if (!like || like.id !== likeId) return false;
    return runLikeMutation(async () => {
      await matchApi.block(like.peer.id);
      // A successful block is already authoritative. Do not keep the previous
      // private projection visible while its guarded replacement is loading.
      setLike((current) => current?.id === likeId ? null : current);
      return matchApi.getLike(likeId);
    });
  }, [like, likeId, runLikeMutation]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      versionRef.current += 1;
    };
  }, [refetch]);

  return {
    like: like?.id === likeId ? like : null,
    loading: loadLoading || (like?.id !== likeId && loadError === null && !(actionScope === likeId && actionError)),
    actionLoading: actionLoading && actionScope === likeId,
    error: loadError ?? (actionScope === likeId ? actionError : null),
    refetch,
    respond,
    accept,
    reject,
    withdraw,
    block,
  };
}
