import { useCallback, useEffect, useRef, useState } from "react";
import { matchApi, type MatchingConnectionDTO } from "@/client/api/match.api";
import { useApi } from "./useApi";
import { ApiClientError } from "@/client/api/errors";
import { createIdempotencyKey } from "@/client/api/idempotency";

export function useMatchingConnection(
  connectionId: string | null,
  initial?: MatchingConnectionDTO,
) {
  const [connection, setConnection] = useState<MatchingConnectionDTO | null>(
    initial ?? null,
  );
  const [actionScope, setActionScope] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const mutationLock = useRef<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const {
    runSafe: runLoadSafe,
    loading: loadLoading,
    error: loadError,
  } = useApi("matching-connection");
  const {
    runSafe: runActionSafe,
    loading: actionLoading,
    error: actionError,
  } = useApi("matching-connection-action");

  const refetch = useCallback(async (): Promise<boolean> => {
    if (!connectionId || mutationLock.current === connectionId) return false;
    const version = ++requestVersion.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await runLoadSafe(
      async () => {
        try { return await matchApi.getConnection(connectionId, controller.signal); }
        catch (error) {
          if (version === requestVersion.current && !controller.signal.aborted && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(error.code))) setConnection(null);
          throw error;
        }
      },
      { suppressGlobalError: true },
    );
    if (!result || controller.signal.aborted || version !== requestVersion.current) return false;
    setConnection(result);
    return true;
  }, [connectionId, runLoadSafe]);

  const confirm = useCallback(
    async (action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE"): Promise<boolean> => {
      if (!connectionId || mutationLock.current === connectionId) return false;
      mutationLock.current = connectionId;
      setActionScope(connectionId);
      const version = ++requestVersion.current;
      abortRef.current?.abort();
      const signature = `${connectionId}:${action}`;
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: createIdempotencyKey() };
      const key = attempt.current.key;
      const result = await runActionSafe(
        async () => {
          try { return await matchApi.confirmConnection(connectionId, action, { idempotencyKey: key }); }
          catch (error) {
            if (version === requestVersion.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(error.code))) setConnection(null);
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      if (mutationLock.current === connectionId) mutationLock.current = null;
      if (!result || version !== requestVersion.current) return false;
      attempt.current = null;
      setConnection(result);
      return true;
    },
    [connectionId, runActionSafe],
  );

  useEffect(() => {
    if (!connectionId || initial?.id === connectionId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      requestVersion.current += 1;
    };
  }, [connectionId, initial?.id, refetch]);

  return {
    connection: connection?.id !== connectionId || (loadError && ([401, 403, 404].includes(loadError.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(loadError.code))) ? null : connection,
    loading:
      loadLoading ||
      (Boolean(connectionId) && connection?.id !== connectionId && loadError === null),
    actionLoading: actionLoading && actionScope === connectionId,
    error: loadError ?? (actionScope === connectionId ? actionError : null),
    refetch,
    confirm,
  };
}
