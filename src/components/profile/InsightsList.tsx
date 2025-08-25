// src/components/profile/InsightsList.tsx
'use client';

export default function InsightsList({ items }: { items: { _id?: string; title?: string; axis?: string; delta?: number }[] }) {
  if (!items?.length) {
    return <div className="text-sm text-gray-600">Пока нет инсайтов</div>;
  }
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={it._id ?? i} className="p-2 rounded bg-gray-50 flex items-center justify-between">
          <div>
            <div className="font-medium">{it.title ?? 'Инсайт'}</div>
            <div className="text-xs text-gray-600">{it.axis ? `ось: ${it.axis}` : '\u00A0'}</div>
          </div>
          {typeof it.delta === 'number' && (
            <span className={`text-sm ${it.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {it.delta > 0 ? '+' : ''}{it.delta}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
