'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { economyApi, type EconomyHistoryDTO, type EconomyOverviewDTO, type EconomyPurchaseDTO, type EconomyPairCollectionDTO, type EconomyContributionDTO } from '@/client/api/economy.api';
import { createIdempotencyKey } from '@/client/api/idempotency';
import { isApiClientError, toUiErrorState, type UiErrorState } from '@/client/api/errors';

const errorMessage = (error: Error | null): UiErrorState =>
  toUiErrorState(error ?? new Error('Не удалось обновить кошелёк. Повторите действие.'));

// Stores a random command id under its item/context key, never auth or wallet data.
// A lost response followed by reload can replay the same capsule purchase.
const pendingKey = (itemId: string): string => `economy-command:${itemId}`;
const pendingOperation = (itemId: string): string | null => {
  try {
    const value = window.sessionStorage.getItem(pendingKey(itemId));
    return value && /^[a-f0-9-]{36}$/i.test(value) ? value : null;
  } catch { return null; }
};
const savePendingOperation = (itemId: string, value: string | null) => {
  try {
    if (value) window.sessionStorage.setItem(pendingKey(itemId), value);
    else window.sessionStorage.removeItem(pendingKey(itemId));
  } catch { /* In-memory retry still works when browser storage is unavailable. */ }
};

export function useEconomy(pairId: string | null = null, enabled = true) {
  const [overview, setOverview] = useState<EconomyOverviewDTO | null>(null);
  const [history, setHistory] = useState<EconomyHistoryDTO>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);
  const [receipt, setReceipt] = useState<EconomyPurchaseDTO | null>(null);
  const [pairSnapshot, setPairSnapshot] = useState<EconomyPairCollectionDTO | null>(null);
  const [pairError, setPairError] = useState<UiErrorState | null>(null);
  const [contribution, setContribution] = useState<EconomyContributionDTO | null>(null);
  const pendingPurchases = useRef(new Map<string, string>());

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) return;
    try {
      const [nextOverview, nextHistory] = await Promise.all([economyApi.overview(signal), economyApi.history(undefined, signal)]);
      if (signal?.aborted) return;
      setOverview(nextOverview);
      setHistory(nextHistory);
      setError(null);
    } catch (caught) {
      if (!signal?.aborted) setError(errorMessage(caught instanceof Error ? caught : null));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled]);

  const refreshPair = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !pairId) return;
    try {
      const next = await economyApi.pairCollection(pairId, signal);
      if (!signal?.aborted) { setPairSnapshot(next); setPairError(null); }
    } catch (caught) {
      if (!signal?.aborted) { setPairSnapshot(null); setPairError(errorMessage(caught instanceof Error ? caught : null)); }
    }
  }, [enabled, pairId]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void refreshPair(controller.signal); });
    return () => controller.abort();
  }, [refreshPair]);

  const purchase = async (itemId: string): Promise<boolean> => {
    if (busy || !enabled) return false;
    setBusy(true);
    setError(null);
    const operationId = pendingPurchases.current.get(itemId) ?? pendingOperation(itemId) ?? createIdempotencyKey();
    pendingPurchases.current.set(itemId, operationId);
    savePendingOperation(itemId, operationId);
    try {
      const result = await economyApi.purchase(itemId, operationId);
      pendingPurchases.current.delete(itemId);
      savePendingOperation(itemId, null);
      setReceipt(result);
      await refresh();
      return true;
    } catch (caught) {
      if (caught instanceof Error && isApiClientError(caught) && [400, 403, 404, 409].includes(caught.status)) {
        pendingPurchases.current.delete(itemId);
        savePendingOperation(itemId, null);
      }
      setError(errorMessage(caught instanceof Error ? caught : null));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const equip = async (itemId: string | null) => {
    if (busy || !enabled) return;
    setBusy(true);
    setError(null);
    try {
      await economyApi.equip(itemId);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : null));
    } finally {
      setBusy(false);
    }
  };

  const contribute = async (itemId: string): Promise<boolean> => {
    if (busy || !enabled || !pairId) return false;
    setBusy(true); setError(null);
    const commandKey = `contribution:${pairId}:${itemId}`;
    const operationId = pendingPurchases.current.get(commandKey) ?? pendingOperation(commandKey) ?? createIdempotencyKey();
    pendingPurchases.current.set(commandKey, operationId); savePendingOperation(commandKey, operationId);
    try {
      const result = await economyApi.contribute(pairId, itemId, operationId);
      pendingPurchases.current.delete(commandKey); savePendingOperation(commandKey, null);
      setContribution(result);
      await Promise.all([refresh(), refreshPair()]);
      return true;
    } catch (caught) {
      if (caught instanceof Error && isApiClientError(caught) && [400, 403, 404, 409].includes(caught.status)) {
        pendingPurchases.current.delete(commandKey); savePendingOperation(commandKey, null);
      }
      setError(errorMessage(caught instanceof Error ? caught : null));
      await refreshPair();
      return false;
    } finally { setBusy(false); }
  };

  const moreHistory = async () => {
    if (busy || !enabled || !history.nextCursor) return;
    setBusy(true);
    try {
      const page = await economyApi.history(history.nextCursor);
      setHistory((current) => ({ items: [...current.items, ...page.items], nextCursor: page.nextCursor }));
    } catch (caught) {
      setError(errorMessage(caught instanceof Error ? caught : null));
    } finally {
      setBusy(false);
    }
  };

  return { overview, history, loading, busy, error, receipt, refresh, purchase, equip, moreHistory, contribute, refreshPair, pairError,
    pairCollection: pairSnapshot?.pairId === pairId ? pairSnapshot : null,
    contribution: contribution?.pairId === pairId ? contribution : null };
}
