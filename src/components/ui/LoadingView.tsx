'use client';

import Spinner from './Spinner';

type LoadingViewProps = {
  label?: string;
  compact?: boolean;
};

export default function LoadingView({ label = 'Загрузка...', compact = false }: LoadingViewProps) {
  if (compact) {
    return (
      <div className="app-muted flex items-center gap-2 text-sm" role="status" aria-live="polite">
        <Spinner size={16} />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="app-page-state app-muted" role="status" aria-live="polite">
      <div className="app-panel app-reveal flex items-center gap-3 px-4 py-3">
        <Spinner size={24} />
        <span className="font-medium">{label}</span>
      </div>
    </div>
  );
}
