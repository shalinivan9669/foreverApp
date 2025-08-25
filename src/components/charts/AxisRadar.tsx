// src/components/charts/AxisRadar.tsx
'use client';

type Axis = 'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';

export default function AxisRadar({ levels }: { levels: Record<Axis, number> }) {
  // Упрощённо выводим список % по осям (без сторонних либ)
  const items: { key: Axis; label: string }[] = [
    { key: 'communication', label: 'Коммуникация' },
    { key: 'domestic', label: 'Быт' },
    { key: 'personalViews', label: 'Взгляды' },
    { key: 'finance', label: 'Финансы' },
    { key: 'sexuality', label: 'Интим' },
    { key: 'psyche', label: 'Психика' },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {items.map(it => (
        <div key={it.key} className="flex items-center gap-3">
          <div className="w-28 text-sm text-gray-600">{it.label}</div>
          <div className="flex-1 h-2 rounded bg-gray-200 overflow-hidden">
            <div
              className="h-2 bg-emerald-500"
              style={{ width: `${Math.max(0, Math.min(100, levels[it.key] ?? 0))}%` }}
            />
          </div>
          <div className="w-10 text-right text-sm">{Math.round(levels[it.key] ?? 0)}%</div>
        </div>
      ))}
    </div>
  );
}
