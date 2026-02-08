import { useCallback, useEffect, useRef, useState } from 'react';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionnaireCardDTO } from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { useApi } from './useApi';

const DEFAULT_CACHE_KEY = 'questionnaires:cards';

type UseQuestionnairesOptions = {
  enabled?: boolean;
  cacheKey?: string;
  audience?: 'personal' | 'couple';
};

export function useQuestionnaires(options: UseQuestionnairesOptions = {}) {
  const enabled = options.enabled ?? true;
  const cacheKey = options.cacheKey ?? DEFAULT_CACHE_KEY;
  const audience = options.audience;

  const getCards = useEntitiesStore((state) => state.getQuestionnaireCards);
  const setCards = useEntitiesStore((state) => state.setQuestionnaireCards);

  const [cards, setCardsState] = useState<QuestionnaireCardDTO[]>(getCards(cacheKey) ?? []);

  const {
    runSafe,
    loading,
    error,
  } = useApi('questionnaire-cards');
  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const refetch = useCallback(async (): Promise<QuestionnaireCardDTO[] | null> => {
    versionRef.current += 1;
    const requestVersion = versionRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fresh = await runSafe(() => questionnairesApi.getCards(controller.signal, audience), {
      loadingKey: 'questionnaire-cards',
    });
    if (!fresh || requestVersion !== versionRef.current) return null;

    const normalized = Array.isArray(fresh) ? fresh : [];
    setCards(cacheKey, normalized);
    setCardsState(normalized);
    return normalized;
  }, [audience, cacheKey, runSafe, setCards]);

  useEffect(() => {
    setCardsState(getCards(cacheKey) ?? []);
  }, [cacheKey, getCards]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refetch]);

  return {
    cards,
    loading,
    error,
    refetch,
  };
}
