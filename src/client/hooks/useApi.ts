import { useCallback, useState } from 'react';
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
      applyLoading(true, options);
      setError(null);
      try {
        return await operation();
      } catch (caughtError) {
        const normalized = caughtError instanceof Error ? caughtError : new Error('Unexpected error');
        if (!isAbortError(normalized)) {
          setErrorFromException(normalized, options);
        }
        throw normalized;
      } finally {
        applyLoading(false, options);
      }
    },
    [applyLoading, setErrorFromException]
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
