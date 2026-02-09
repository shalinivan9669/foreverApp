'use client';

import type { UiErrorState } from '@/client/api/errors';

type PaywallViewProps = {
  error: UiErrorState;
  onUpgrade?: () => void;
};

export default function PaywallView({ error, onUpgrade }: PaywallViewProps) {
  return (
    <div className="app-alert app-alert-paywall app-reveal">
      <p className="font-medium">Нужен более высокий тариф</p>
      <p className="mt-1 text-sm">{error.message}</p>
      {onUpgrade && (
        <button type="button" onClick={onUpgrade} className="app-btn-primary mt-3 px-3 py-1.5 text-sm">
          Улучшить тариф
        </button>
      )}
    </div>
  );
}
