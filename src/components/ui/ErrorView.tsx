'use client';

import type { UiErrorState } from '@/client/api/errors';

type ErrorViewProps = {
  error: UiErrorState | null;
  onRetry?: () => void;
  onAuthRequired?: () => void;
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
}: ErrorViewProps) {
  if (!error) return null;

  if (error.kind === 'rate_limited') {
    const retryLabel = retryAfterLabel(error.retryAfterMs);
    return (
      <div className="app-alert app-alert-rate app-reveal" role="alert" aria-live="polite">
        <p className="font-medium">{error.message}</p>
        {retryLabel && <p className="mt-1 text-sm">{retryLabel}</p>}
        {onRetry && (
          <button type="button" onClick={onRetry} className="app-btn-secondary mt-3 px-3 py-1.5 text-sm">
            Повторить
          </button>
        )}
      </div>
    );
  }

  if (error.kind === 'auth_required') {
    return (
      <div className="app-alert app-alert-auth app-reveal" role="alert" aria-live="polite">
        <p className="font-medium">Требуется авторизация</p>
        <p className="mt-1 text-sm">{error.message}</p>
        {onAuthRequired && (
          <button type="button" onClick={onAuthRequired} className="app-btn-primary mt-3 px-3 py-1.5 text-sm">
            Войти снова
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app-alert app-alert-error app-reveal" role="alert" aria-live="polite">
      <p className="font-medium">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="app-btn-secondary mt-3 px-3 py-1.5 text-sm">
          Повторить
        </button>
      )}
    </div>
  );
}
