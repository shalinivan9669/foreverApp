'use client';

import { useCallback, useEffect, useState } from 'react';
import { pairEventsApi } from '@/client/api/pairEvents.api';
import { isApiClientError } from '@/client/api/errors';
import type { PairActivityDTO, PairEventDTO } from '@/client/api/types';

const mutationErrorMessage = (error: Error, fallback: string): string =>
  isApiClientError(error) && error.message.trim().length > 0 ? error.message : fallback;

export function usePairEvents(pairId?: string | null) {
  const [events, setEvents] = useState<PairEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAcceptedActivities, setLastAcceptedActivities] = useState<PairActivityDTO[]>([]);

  const refetch = useCallback(async (signal?: AbortSignal) => {
    if (!pairId) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await pairEventsApi.getPairEvents(pairId, undefined, signal);
      setEvents(result.events);
    } catch {
      if (!signal?.aborted) {
        setEvents([]);
        setError('Не удалось загрузить события пары.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [pairId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refetch(controller.signal);
    });
    return () => controller.abort();
  }, [refetch]);

  const acceptEvent = useCallback(async (eventId: string) => {
    if (!pairId) return;
    setMutationLoading(true);
    setError(null);
    try {
      const result = await pairEventsApi.acceptPairEvent(pairId, eventId);
      setLastAcceptedActivities(result.activities);
      setEvents((current) =>
        current.map((event) => (event.id === result.event.id ? result.event : event))
      );
      await refetch();
    } catch (error) {
      const fallback = 'Не удалось принять событие. Проверьте текущую активность пары.';
      setError(error instanceof Error ? mutationErrorMessage(error, fallback) : fallback);
    } finally {
      setMutationLoading(false);
    }
  }, [pairId, refetch]);

  const declineEvent = useCallback(async (eventId: string) => {
    if (!pairId) return;
    setMutationLoading(true);
    setError(null);
    try {
      const result = await pairEventsApi.declinePairEvent(pairId, eventId);
      setEvents((current) => current.filter((event) => event.id !== result.event.id));
    } catch (error) {
      const fallback = 'Не удалось скрыть событие.';
      setError(error instanceof Error ? mutationErrorMessage(error, fallback) : fallback);
    } finally {
      setMutationLoading(false);
    }
  }, [pairId]);

  const snoozeEvent = useCallback(async (eventId: string, days: 1 | 3 | 7 = 3) => {
    if (!pairId) return;
    setMutationLoading(true);
    setError(null);
    try {
      const result = await pairEventsApi.snoozePairEvent(pairId, eventId, { days });
      setEvents((current) =>
        current.map((event) => (event.id === result.event.id ? result.event : event))
      );
    } catch (error) {
      const fallback = 'Не удалось отложить событие.';
      setError(error instanceof Error ? mutationErrorMessage(error, fallback) : fallback);
    } finally {
      setMutationLoading(false);
    }
  }, [pairId]);

  return {
    events,
    loading,
    error,
    refetch,
    acceptEvent,
    declineEvent,
    snoozeEvent,
    lastAcceptedActivities,
    mutationLoading,
  };
}
