import React from 'react';

export default function Spinner({ size = 32, className = '', decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  const dim = `${size}px`;
  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${className}`}
      style={{ width: dim, height: dim }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Загрузка'}
      role={decorative ? undefined : 'status'}
    />
  );
}
