import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type MatchingCardDTO,
  type MatchingPreferencesDTO,
  type SaveMatchingCardRequest,
  type SaveMatchingPreferencesRequest,
} from "@/client/api/match.api";
import { useApi } from "./useApi";
import { ApiClientError } from "@/client/api/errors";

export function useMatchProfile() {
  const [card, setCard] = useState<MatchingCardDTO | null>(null);
  const [preferences, setPreferences] = useState<MatchingPreferencesDTO | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const mutationPending = useRef(false);
  const invalidateOnDenial = useCallback((error: Error) => {
    if (error instanceof ApiClientError && ([401, 403].includes(error.status) || error.code === "MATCHING_SOLO_REQUIRED")) {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
      setCard(null);
      setPreferences(null);
    }
  }, []);

  const {
    runSafe: runLoadSafe,
    loading: loadLoading,
    error: loadError,
    clearError: clearLoadError,
  } = useApi("matching-profile");
  const {
    runSafe: runMutationSafe,
    loading: mutationLoading,
    error: mutationError,
    clearError: clearMutationError,
  } = useApi("matching-profile-mutation");

  const refetch = useCallback(async (): Promise<boolean> => {
    if (mutationPending.current) return false;
    requestVersionRef.current += 1;
    const requestVersion = requestVersionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const result = await runLoadSafe(
      async () => {
        try {
          const [nextCard, nextPreferences] = await Promise.all([
          matchApi.getOwnCard(controller.signal),
          matchApi.getPreferences(controller.signal),
        ]);
          return { nextCard, nextPreferences };
        } catch (error) {
          if (requestVersion === requestVersionRef.current && !controller.signal.aborted && error instanceof Error) invalidateOnDenial(error);
          throw error;
        }
      },
      { suppressGlobalError: true },
    );

    if (!result || requestVersion !== requestVersionRef.current) return false;
    setCard(result.nextCard);
    setPreferences(result.nextPreferences);
    return true;
  }, [runLoadSafe, invalidateOnDenial]);

  const saveCard = useCallback(
    async (input: SaveMatchingCardRequest): Promise<boolean> => {
      if (mutationPending.current) return false;
      mutationPending.current = true;
      const version = ++requestVersionRef.current;
      abortRef.current?.abort();
      const saved = await runMutationSafe(async () => {
        try { return await matchApi.saveOwnCard(input); }
        catch (error) { if (version === requestVersionRef.current && error instanceof Error) invalidateOnDenial(error); throw error; }
      }, {
        suppressGlobalError: true,
      });
      mutationPending.current = false;
      if (!saved || version !== requestVersionRef.current) return false;
      setCard(saved);
      return true;
    },
    [runMutationSafe, invalidateOnDenial],
  );

  const savePreferences = useCallback(
    async (input: SaveMatchingPreferencesRequest): Promise<boolean> => {
      if (mutationPending.current) return false;
      mutationPending.current = true;
      const version = ++requestVersionRef.current;
      abortRef.current?.abort();
      const saved = await runMutationSafe(
        async () => {
          try { return await matchApi.updatePreferences(input); }
          catch (error) { if (version === requestVersionRef.current && error instanceof Error) invalidateOnDenial(error); throw error; }
        },
        { suppressGlobalError: true },
      );
      if (!saved || version !== requestVersionRef.current) { mutationPending.current = false; return false; }
      setPreferences(saved);
      const refreshedCard = await runMutationSafe(async () => {
        try { return await matchApi.getOwnCard(); }
        catch (error) { if (version === requestVersionRef.current && error instanceof Error) invalidateOnDenial(error); throw error; }
      }, { suppressGlobalError: true });
      mutationPending.current = false;
      if (version !== requestVersionRef.current) return false;
      if (refreshedCard) setCard(refreshedCard);
      return Boolean(refreshedCard);
    },
    [runMutationSafe, invalidateOnDenial],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refetch();
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      requestVersionRef.current += 1;
    };
  }, [refetch]);

  return {
    card,
    preferences,
    loading: loadLoading || (card === null && loadError === null && mutationError === null),
    saving: mutationLoading,
    error: loadError ?? mutationError,
    refetch,
    saveCard,
    savePreferences,
    clearError: () => {
      clearLoadError();
      clearMutationError();
    },
  };
}
