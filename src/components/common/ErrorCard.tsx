// src/components/common/ErrorCard.tsx
'use client';

export default function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4 border border-rose-200 bg-rose-50 rounded">
      <div className="text-rose-700 text-sm">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 px-3 py-1 rounded bg-rose-600 text-white text-sm">
          Повторить
        </button>
      )}
    </div>
  );
}
