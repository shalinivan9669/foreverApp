'use client';

import type { UiErrorState } from '@/client/api/errors';
import PaywallView from './PaywallView';

type ErrorViewProps = {
  error: UiErrorState | null;
  onRetry?: () => void;
  onAuthRequired?: () => void;
  onUpgrade?: () => void;
};

const retryAfterLabel = (retryAfterMs?: number): string => {
  if (!retryAfterMs) return '';
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Повторите через ${seconds} сек.`;
};

export default function ErrorView({
  error,
  onRetry,
  onAuthRequired,
  onUpgrade,
}: ErrorViewProps) {
  if (!error) return null;

  if (error.kind === 'paywall') {
    return <PaywallView error={error} onUpgrade={onUpgrade} />;
  }

  if (error.kind === 'rate_limited') {
    return (
      <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-orange-900">
        <p className="font-medium">{error.message}</p>
        <p className="mt-1 text-sm">{retryAfterLabel(error.retryAfterMs)}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded border border-orange-300 px-3 py-1.5 text-sm hover:bg-orange-100"
          >
            Повторить
          </button>
        )}
      </div>
    );
  }

  if (error.kind === 'auth_required') {
    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-blue-900">
        <p className="font-medium">Нужна авторизация</p>
        <p className="mt-1 text-sm">{error.message}</p>
        {onAuthRequired && (
          <button
            type="button"
            onClick={onAuthRequired}
            className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Перезапустить авторизацию
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      <p className="font-medium">{error.message}</p>
      <p className="mt-1 text-xs text-red-700">Код: {error.code}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100"
        >
          Повторить
        </button>
      )}
    </div>
  );
}
