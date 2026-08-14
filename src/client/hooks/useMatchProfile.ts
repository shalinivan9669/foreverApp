import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchApi,
  type MatchingCardDTO,
  type MatchingPreferencesDTO,
  type SaveMatchingCardRequest,
  type SaveMatchingPreferencesRequest,
} from "@/client/api/match.api";
import { useApi } from "./useApi";

export function useMatchProfile() {
  const [card, setCard] = useState<MatchingCardDTO | null>(null);
  const [preferences, setPreferences] = useState<MatchingPreferencesDTO | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);

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
    requestVersionRef.current += 1;
    const requestVersion = requestVersionRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const result = await runLoadSafe(
      async () => {
        const [nextCard, nextPreferences] = await Promise.all([
          matchApi.getOwnCard(controller.signal),
          matchApi.getPreferences(controller.signal),
        ]);
        return { nextCard, nextPreferences };
      },
      { suppressGlobalError: true },
    );

    if (!result || requestVersion !== requestVersionRef.current) return false;
    setCard(result.nextCard);
    setPreferences(result.nextPreferences);
    return true;
  }, [runLoadSafe]);

  const saveCard = useCallback(
    async (input: SaveMatchingCardRequest): Promise<boolean> => {
      const saved = await runMutationSafe(() => matchApi.saveOwnCard(input), {
        suppressGlobalError: true,
      });
      if (!saved) return false;
      setCard(saved);
      return true;
    },
    [runMutationSafe],
  );

  const savePreferences = useCallback(
    async (input: SaveMatchingPreferencesRequest): Promise<boolean> => {
      const saved = await runMutationSafe(
        () => matchApi.updatePreferences(input),
        { suppressGlobalError: true },
      );
      if (!saved) return false;
      setPreferences(saved);
      const refreshedCard = await matchApi.getOwnCard().catch(() => null);
      if (refreshedCard) setCard(refreshedCard);
      return true;
    },
    [runMutationSafe],
  );

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
    card,
    preferences,
    loading: loadLoading || (card === null && loadError === null),
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
