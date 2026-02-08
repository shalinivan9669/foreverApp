'use client';

import Spinner from './Spinner';

type LoadingViewProps = {
  label?: string;
  compact?: boolean;
};

export default function LoadingView({ label = 'Загрузка…', compact = false }: LoadingViewProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Spinner size={16} />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-8 text-gray-600">
      <div className="flex items-center gap-3">
        <Spinner size={24} />
        <span>{label}</span>
      </div>
    </div>
  );
}
