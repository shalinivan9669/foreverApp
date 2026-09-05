"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { developmentApi } from "@/client/api/development.api";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
  DevelopmentOverviewDTO,
} from "@/lib/dto/development.dto";

export function useDevelopment(runId: string | null = null) {
  const [overview, setOverview] = useState<DevelopmentOverviewDTO | null>(null);
  const [detail, setDetail] = useState<DevelopmentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overviewError, setOverviewError] = useState<UiErrorState | null>(null);
  const [detailError, setDetailError] = useState<UiErrorState | null>(null);
  const busyRef = useRef(false);
  const detailVersion = useRef(0);
  const overviewVersion = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++overviewVersion.current;
    setLoading(true);
    try {
      const result = await developmentApi.overview(signal);
      if (!signal?.aborted && version === overviewVersion.current) {
        setOverview(result);
        setOverviewError(null);
      }
    } catch (e) {
      if (!signal?.aborted && version === overviewVersion.current) {
        const normalized = toUiErrorState(
            e instanceof Error
              ? e
              : new Error("Не удалось загрузить библиотеку."),
          );
        setOverviewError(normalized);
        if ([401, 403, 404].includes(normalized.status)) {
          setOverview(null);
          setDetail(null);
        }
      }
    } finally {
      if (!signal?.aborted && version === overviewVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);
  const execute = useCallback(async (action: () => Promise<DevelopmentDetailDTO>) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    const version = ++detailVersion.current;
    setBusy(true);
    setDetailError(null);
    try {
      const next = await action();
      if (version !== detailVersion.current) return null;
      setDetail(next);
      await load();
      return version === detailVersion.current ? next : null;
    } catch (e) {
      if (version !== detailVersion.current) return null;
      const normalized = toUiErrorState(
        e instanceof Error ? e : new Error("Не удалось сохранить занятие."),
      );
      setDetailError(normalized);
      if ([401, 403, 404].includes(normalized.status) || normalized.code === "CONTENT_VERSION_UNAVAILABLE") setDetail(null);
      return null;
    } finally {
      if (version === detailVersion.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [load]);
  const open = useCallback((id: string) => execute(() => developmentApi.detail(id)), [execute]);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++detailVersion.current;
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setDetail(null);
      setDetailError(null);
      busyRef.current = Boolean(runId);
      setBusy(Boolean(runId));
      if (!runId) return;
      setBusy(true);
      try {
        const next = await developmentApi.detail(runId, controller.signal);
        if (!controller.signal.aborted && version === detailVersion.current) setDetail(next);
      } catch (e) {
        if (!controller.signal.aborted && version === detailVersion.current) setDetailError(toUiErrorState(e instanceof Error ? e : new Error("Не удалось открыть занятие.")));
      } finally {
        if (!controller.signal.aborted && version === detailVersion.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    });
    return () => controller.abort();
  }, [runId]);
  const refresh = useCallback(async () => {
    if (detail) await open(detail.run.id);
    else if (runId) await open(runId);
    else await load();
  }, [detail, load, open, runId]);
  return {
    overview,
    detail,
    loading,
    busy,
    error: detailError ?? overviewError,
    reload: load,
    close: () => { detailVersion.current += 1; setDetail(null); },
    open,
    start: (key: string, pairId?: string) =>
      execute(() => developmentApi.start(key, pairId)),
    refresh,
    complete: async (input: DevelopmentCompleteInput) => {
      await execute(() => developmentApi.complete(input));
    },
  };
}
