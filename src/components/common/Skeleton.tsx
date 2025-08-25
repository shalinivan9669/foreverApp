// src/components/common/Skeleton.tsx
'use client';

export default function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-100 rounded" />
      ))}
    </div>
  );
}
