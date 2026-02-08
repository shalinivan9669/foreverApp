'use client';

import Spinner from './Spinner';

type LoadingViewProps = {
  label?: string;
  compact?: boolean;
};

export default function LoadingView({ label = 'Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В°РІР‚В¦', compact = false }: LoadingViewProps) {
  if (compact) {
    return (
      <div className="app-muted flex items-center gap-2 text-sm">
        <Spinner size={16} />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="app-muted flex items-center justify-center py-8">
      <div className="app-panel flex items-center gap-3 px-4 py-3">
        <Spinner size={24} />
        <span>{label}</span>
      </div>
    </div>
  );
}
