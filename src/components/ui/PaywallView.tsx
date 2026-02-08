'use client';

import type { UiErrorState } from '@/client/api/errors';

type PaywallViewProps = {
  error: UiErrorState;
  onUpgrade?: () => void;
};

export default function PaywallView({ error, onUpgrade }: PaywallViewProps) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="font-medium">Требуется план выше текущего</p>
      <p className="mt-1 text-sm">{error.message}</p>
      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-3 rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
        >
          Улучшить план
        </button>
      )}
    </div>
  );
}
