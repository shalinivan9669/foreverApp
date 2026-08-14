import { useCallback, useEffect, useRef, useState } from "react";
import { matchApi, type MatchingConnectionDTO } from "@/client/api/match.api";
import { useApi } from "./useApi";

export function useMatchingConnection(
  connectionId: string | null,
  initial?: MatchingConnectionDTO,
) {
  const [connection, setConnection] = useState<MatchingConnectionDTO | null>(
    initial ?? null,
  );
  const abortRef = useRef<AbortController | null>(null);
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
    if (!connectionId) return false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await runLoadSafe(
      () => matchApi.getConnection(connectionId, controller.signal),
      { suppressGlobalError: true },
    );
    if (!result || controller.signal.aborted) return false;
    setConnection(result);
    return true;
  }, [connectionId, runLoadSafe]);

  const confirm = useCallback(
    async (action: "REQUEST" | "CONFIRM" | "CANCEL"): Promise<boolean> => {
      if (!connectionId) return false;
      const result = await runActionSafe(
        () => matchApi.confirmConnection(connectionId, action),
        { suppressGlobalError: true },
      );
      if (!result) return false;
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
    };
  }, [connectionId, initial?.id, refetch]);

  return {
    connection,
    loading:
      loadLoading ||
      (Boolean(connectionId) && connection === null && loadError === null),
    actionLoading,
    error: loadError ?? actionError,
    refetch,
    confirm,
  };
}
