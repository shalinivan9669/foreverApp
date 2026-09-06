"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { developmentApi } from "@/client/api/development.api";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";
import type {
  DevelopmentCompleteInput,
  DevelopmentDetailDTO,
  DevelopmentOverviewDTO,
  DevelopmentRunPageDTO,
} from "@/lib/dto/development.dto";

export function useDevelopment(runId: string | null = null) {
  const [overview, setOverview] = useState<DevelopmentOverviewDTO | null>(null);
  const [detail, setDetail] = useState<DevelopmentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overviewError, setOverviewError] = useState<UiErrorState | null>(null);
  const [detailError, setDetailError] = useState<UiErrorState | null>(null);
  const [runPage, setRunPage] = useState<DevelopmentRunPageDTO>({ runs: [], nextCursor: null });
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<UiErrorState | null>(null);
  const [runsNotice, setRunsNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const detailVersion = useRef(0);
  const overviewVersion = useRef(0);
  const runsVersion = useRef(0);
  const runsBusy = useRef(false);
  const nextCursor = useRef<string | null>(null);
  const clearRuns = useCallback(() => {
    runsVersion.current += 1;
    runsBusy.current = false;
    nextCursor.current = null;
    setRunPage({ runs: [], nextCursor: null });
    setRunsLoading(false);
  }, []);
  const clearProtectedData = useCallback(() => {
    overviewVersion.current += 1;
    detailVersion.current += 1;
    busyRef.current = false;
    clearRuns();
    setLoading(false);
    setBusy(false);
    setOverview(null);
    setDetail(null);
  }, [clearRuns]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++overviewVersion.current;
    clearRuns();
    setRunsError(null);
    setRunsNotice(null);
    setLoading(true);
    try {
      const [result, page] = await Promise.all([
        developmentApi.overview(signal),
        developmentApi.unfinishedRuns(undefined, signal),
      ]);
      if (!signal?.aborted && version === overviewVersion.current) {
        setOverview(result);
        setRunPage(page);
        nextCursor.current = page.nextCursor;
        setOverviewError(null);
        return true;
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
          clearProtectedData();
        }
      }
    } finally {
      if (!signal?.aborted && version === overviewVersion.current) setLoading(false);
    }
    return false;
  }, [clearProtectedData, clearRuns]);
  const loadMoreRuns = useCallback(async () => {
    const cursor = nextCursor.current;
    if (!cursor || runsBusy.current) return;
    const version = runsVersion.current;
    runsBusy.current = true;
    setRunsLoading(true);
    setRunsError(null);
    setRunsNotice(null);
    try {
      const page = await developmentApi.unfinishedRuns(cursor);
      if (version !== runsVersion.current) return;
      setRunPage((previous) => ({
        runs: [...new Map([...previous.runs, ...page.runs].map((run) => [run.id, run])).values()],
        nextCursor: page.nextCursor,
      }));
      nextCursor.current = page.nextCursor;
    } catch (e) {
      if (version !== runsVersion.current) return;
      const normalized = toUiErrorState(e instanceof Error ? e : new Error("Не удалось загрузить следующую страницу."));
      if (normalized.code === "RUN_LIST_CHANGED") {
        clearRuns();
        const refreshed = load();
        const refreshVersion = overviewVersion.current;
        if (await refreshed && refreshVersion === overviewVersion.current) {
          setRunsNotice("Доступ к занятиям изменился. Показываем актуальный список с первой страницы.");
        }
      } else {
        if ([401, 403, 404].includes(normalized.status)) {
          clearProtectedData();
        }
        setRunsError(normalized);
      }
    } finally {
      if (version === runsVersion.current) {
        runsBusy.current = false;
        setRunsLoading(false);
      }
    }
  }, [clearProtectedData, clearRuns, load]);
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
      if ([401, 403, 404].includes(normalized.status)) {
        clearProtectedData();
      }
      if (normalized.code === "CONTENT_VERSION_UNAVAILABLE") setDetail(null);
      return null;
    } finally {
      if (version === detailVersion.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [clearProtectedData, load]);
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
        if (!controller.signal.aborted && version === detailVersion.current) {
          const normalized = toUiErrorState(e instanceof Error ? e : new Error("Не удалось открыть занятие."));
          setDetailError(normalized);
          if ([401, 403, 404].includes(normalized.status)) clearProtectedData();
        }
      } finally {
        if (!controller.signal.aborted && version === detailVersion.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    });
    return () => controller.abort();
  }, [clearProtectedData, runId]);
  const refresh = useCallback(async () => {
    if (detail) await open(detail.run.id);
    else if (runId) await open(runId);
    else await load();
  }, [detail, load, open, runId]);
  return {
    overview,
    detail,
    unfinishedRuns: runPage.runs,
    hasMoreRuns: Boolean(runPage.nextCursor),
    runsLoading,
    runsError,
    runsNotice,
    loadMoreRuns,
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
