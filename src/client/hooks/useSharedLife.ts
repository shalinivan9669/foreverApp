"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sharedLifeApi } from "@/client/api/sharedLife.api";
import type { SharedLifeCommand } from "@/lib/contracts/sharedLife";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";

export function useSharedLife(pairId: string | null) {
  const [snapshot, setSnapshot] = useState<SharedLifeDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);
  const requestVersion = useRef(0);
  const mutationInFlight = useRef(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!pairId) return;
      if (mutationInFlight.current) return;
      const version = ++requestVersion.current;
      setLoading(true);
      try {
        const data = await sharedLifeApi.get(pairId, signal);
        if (!signal?.aborted && version === requestVersion.current) {
          setSnapshot(data);
          setError(null);
        }
      } catch (e) {
        if (!signal?.aborted && version === requestVersion.current) {
          const normalized = toUiErrorState(
            e instanceof Error
              ? e
              : new Error("Не удалось загрузить общие записи."),
          );
          setError(normalized);
          if ([401, 403, 404].includes(normalized.status)) setSnapshot(null);
        }
      } finally {
        if (!signal?.aborted && version === requestVersion.current) setLoading(false);
      }
    },
    [pairId],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setBusy(false);
        if (!pairId) { setLoading(false); setError(null); setSnapshot(null); }
        else void load(controller.signal);
      }
    });
    return () => { controller.abort(); requestVersion.current += 1; mutationInFlight.current = false; };
  }, [load, pairId]);
  const update = async (command: SharedLifeCommand): Promise<boolean> => {
    if (!pairId || mutationInFlight.current) return false;
    mutationInFlight.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setLoading(false);
    setError(null);
    try {
      const next = await sharedLifeApi.update(pairId, command);
      if (version !== requestVersion.current) return false;
      setSnapshot(next);
      return true;
    } catch (e) {
      if (version !== requestVersion.current) return false;
      const normalized = toUiErrorState(
        e instanceof Error ? e : new Error("Не удалось сохранить запись."),
      );
      setError(normalized);
      if ([401, 403, 404].includes(normalized.status)) setSnapshot(null);
      if (normalized.status === 409) {
        // Keep the local form and its original revision. Fetch only the latest
        // guarded snapshot; the user must compare it before sending again.
        try {
          const current = await sharedLifeApi.get(pairId);
          if (version === requestVersion.current) setSnapshot(current);
        } catch (reloadError) {
          if (version === requestVersion.current) {
            const reloadFailure = toUiErrorState(reloadError instanceof Error ? reloadError : new Error("Не удалось загрузить актуальную запись."));
            if ([401, 403, 404].includes(reloadFailure.status)) {
              setSnapshot(null);
              setError(reloadFailure);
            }
          }
        }
      }
      return false;
    } finally {
      if (version === requestVersion.current) {
        mutationInFlight.current = false;
        setBusy(false);
      }
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
