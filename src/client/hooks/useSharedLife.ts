"use client";
import { useCallback, useEffect, useState } from "react";
import { sharedLifeApi } from "@/client/api/sharedLife.api";
import type { SharedLifeCommand } from "@/lib/contracts/sharedLife";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";

export function useSharedLife(pairId: string | null) {
  const [snapshot, setSnapshot] = useState<SharedLifeDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!pairId) return;
      setLoading(true);
      try {
        const data = await sharedLifeApi.get(pairId, signal);
        if (!signal?.aborted) {
          setSnapshot(data);
          setError(null);
        }
      } catch (e) {
        if (!signal?.aborted) {
          const normalized = toUiErrorState(
            e instanceof Error
              ? e
              : new Error("Не удалось загрузить общие записи."),
          );
          setError(normalized);
          if ([401, 403, 404].includes(normalized.status)) setSnapshot(null);
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [pairId],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  const update = async (command: SharedLifeCommand): Promise<boolean> => {
    if (!pairId) return false;
    setBusy(true);
    setError(null);
    try {
      setSnapshot(await sharedLifeApi.update(pairId, command));
      return true;
    } catch (e) {
      const normalized = toUiErrorState(
        e instanceof Error ? e : new Error("Не удалось сохранить запись."),
      );
      setError(normalized);
      if ([401, 403, 404].includes(normalized.status)) setSnapshot(null);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    data: snapshot?.pairId === pairId ? snapshot : null,
    loading,
    busy,
    error,
    reload: load,
    update,
  };
}
