import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type MatchingConnectionDTO,
  type MatchingInboxDTO,
} from "@/client/api/match.api";
import { useApi } from "./useApi";
import { ApiClientError } from "@/client/api/errors";

const mergePage = (
  current: MatchingInboxDTO | null,
  page: MatchingInboxDTO,
  append: boolean,
): MatchingInboxDTO => {
  if (!current || !append) return page;
  const connectionMap = new Map(
    [...current.connections, ...page.connections].map((item) => [
      item.id,
      item,
    ]),
  );
  return {
    incoming: [...current.incoming, ...page.incoming],
    outgoing: [...current.outgoing, ...page.outgoing],
    connections: [...connectionMap.values()],
    nextCursor: page.nextCursor,
  };
};

export function useInbox() {
  const [data, setData] = useState<MatchingInboxDTO | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const mutationPending = useRef(false);
  const {
    runSafe: runLoadSafe,
    loading: loadLoading,
    error: loadError,
  } = useApi("matching-inbox");
  const {
    runSafe: runActionSafe,
    loading: actionLoading,
    error: actionError,
  } = useApi("matching-connection-action");

  const load = useCallback(
    async (cursor?: string): Promise<boolean> => {
      if (mutationPending.current) return false;
      requestVersionRef.current += 1;
      const requestVersion = requestVersionRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const page = await runLoadSafe(
        async () => {
          try { return await matchApi.getInbox(cursor, 20, controller.signal); }
          catch (error) {
            if (requestVersion === requestVersionRef.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(error.code))) setData(null);
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      if (!page || requestVersion !== requestVersionRef.current) return false;
      setData((current) => mergePage(current, page, Boolean(cursor)));
      return true;
    },
    [runLoadSafe],
  );

  const confirmConnection = useCallback(
    async (
      connectionId: string,
      action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE",
    ): Promise<boolean> => {
      if (mutationPending.current) return false;
      mutationPending.current = true;
      const version = ++requestVersionRef.current;
      abortRef.current?.abort();
      const updated = await runActionSafe(
        async () => {
          try { return await matchApi.confirmConnection(connectionId, action); }
          catch (error) {
            if (version === requestVersionRef.current && error instanceof ApiClientError && ([401, 403, 404].includes(error.status) || ["MATCHING_BLOCKED", "MATCHING_SOLO_REQUIRED"].includes(error.code))) setData(null);
            throw error;
          }
        },
        { suppressGlobalError: true },
      );
      mutationPending.current = false;
      if (!updated || version !== requestVersionRef.current) return false;
      setData((current) =>
        current
          ? {
              ...current,
              connections: current.connections.map((connection) =>
                connection.id === updated.id ? updated : connection,
              ),
            }
          : current,
      );
      return true;
    },
    [runActionSafe],
  );

  const replaceConnection = useCallback((updated: MatchingConnectionDTO) => {
    setData((current) =>
      current
        ? {
            ...current,
            connections: current.connections.map((connection) =>
              connection.id === updated.id ? updated : connection,
            ),
          }
        : current,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      requestVersionRef.current += 1;
    };
  }, [load]);

  return {
    data: loadError ? null : data,
    incoming: loadError ? [] : data?.incoming ?? [],
    outgoing: loadError ? [] : data?.outgoing ?? [],
    connections: loadError ? [] : data?.connections ?? [],
    nextCursor: data?.nextCursor,
    loading: loadLoading || (data === null && loadError === null),
    actionLoading,
    error: loadError ?? actionError,
    refetch: () => load(),
    loadMore: () =>
      data?.nextCursor ? load(data.nextCursor) : Promise.resolve(false),
    confirmConnection,
    replaceConnection,
  };
}
