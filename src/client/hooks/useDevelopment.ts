"use client";
import { useCallback, useEffect, useState } from "react";
import { developmentApi } from "@/client/api/development.api";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
  DevelopmentOverviewDTO,
} from "@/lib/dto/development.dto";

export function useDevelopment() {
  const [overview, setOverview] = useState<DevelopmentOverviewDTO | null>(null);
  const [detail, setDetail] = useState<DevelopmentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await developmentApi.overview(signal);
      if (!signal?.aborted) {
        setOverview(result);
        setError(null);
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(
          toUiErrorState(
            e instanceof Error
              ? e
              : new Error("Не удалось загрузить библиотеку."),
          ),
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  const execute = async (action: () => Promise<DevelopmentDetailDTO>) => {
    setBusy(true);
    setError(null);
    try {
      setDetail(await action());
      await load();
    } catch (e) {
      const normalized = toUiErrorState(
        e instanceof Error ? e : new Error("Не удалось сохранить занятие."),
      );
      setError(normalized);
      if ([401, 403, 404].includes(normalized.status)) setDetail(null);
    } finally {
      setBusy(false);
    }
  };
  return {
    overview,
    detail,
    loading,
    busy,
    error,
    reload: load,
    close: () => setDetail(null),
    start: (key: string, pairId?: string) =>
      execute(() => developmentApi.start(key, pairId)),
    refresh: () =>
      detail
        ? execute(() => developmentApi.detail(detail.run.id))
        : Promise.resolve(),
    complete: (input: DevelopmentCompleteInput) =>
      execute(() => developmentApi.complete(input)),
  };
}
