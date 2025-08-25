// src/components/common/EmptyState.tsx
'use client';

export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center p-6 border rounded">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle && <div className="text-sm text-gray-600 mt-1">{subtitle}</div>}
    </div>
  );
}
