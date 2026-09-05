import { useCallback, useRef, useState } from 'react';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
import { useUiStore } from '@/client/stores/useUiStore';

const isAbortError = (error: Error): boolean => error.name === 'AbortError';

export type ApiRunOptions = {
  loadingKey?: string;
  suppressGlobalError?: boolean;
};

export type UseApiResult = {
  loading: boolean;
  error: UiErrorState | null;
  clearError: () => void;
  setErrorFromException: (error: Error, options?: ApiRunOptions) => UiErrorState;
  run: <T>(operation: () => Promise<T>, options?: ApiRunOptions) => Promise<T>;
  runSafe: <T>(operation: () => Promise<T>, options?: ApiRunOptions) => Promise<T | null>;
};

export function useApi(defaultLoadingKey?: string): UseApiResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);
  const runSequence = useRef(0);
  const loadingSequenceByKey = useRef(new Map<string, number>());
  const setGlobalLoading = useUiStore((state) => state.setLoading);
  const setGlobalError = useUiStore((state) => state.setLastError);

  const applyLoading = useCallback(
    (value: boolean, options?: ApiRunOptions) => {
      setLoading(value);
      const key = options?.loadingKey ?? defaultLoadingKey;
      if (key) {
        setGlobalLoading(key, value);
      }
    },
    [defaultLoadingKey, setGlobalLoading]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setErrorFromException = useCallback(
    (exception: Error, options?: ApiRunOptions): UiErrorState => {
      const mapped = toUiErrorState(exception);
      setError(mapped);
      if (!options?.suppressGlobalError) {
        setGlobalError(mapped);
      }
      return mapped;
    },
    [setGlobalError]
  );

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, options?: ApiRunOptions): Promise<T> => {
      const sequence = ++runSequence.current;
      const loadingKey = options?.loadingKey ?? defaultLoadingKey;
      if (loadingKey) loadingSequenceByKey.current.set(loadingKey, sequence);
      applyLoading(true, options);
      setError(null);
      try {
        return await operation();
      } catch (caughtError) {
        const normalized = caughtError instanceof Error ? caughtError : new Error('Unexpected error');
        if (sequence === runSequence.current && !isAbortError(normalized)) {
          setErrorFromException(normalized, options);
        }
        throw normalized;
      } finally {
        if (sequence === runSequence.current) setLoading(false);
        if (loadingKey && loadingSequenceByKey.current.get(loadingKey) === sequence) {
          loadingSequenceByKey.current.delete(loadingKey);
          setGlobalLoading(loadingKey, false);
        }
      }
    },
    [applyLoading, defaultLoadingKey, setErrorFromException, setGlobalLoading]
  );

  const runSafe = useCallback(
    async <T,>(operation: () => Promise<T>, options?: ApiRunOptions): Promise<T | null> => {
      try {
        return await run(operation, options);
      } catch {
        return null;
      }
    },
    [run]
  );

  return {
    loading,
    error,
    clearError,
    setErrorFromException,
    run,
    runSafe,
  };
}
