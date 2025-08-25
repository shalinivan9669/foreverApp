// src/components/profile/PreferencesCard.tsx
'use client';

export default function PreferencesCard({
  value,
  editable = false,
  note,
}: {
  value: { age: [number, number]; radiusKm: number; valuedQualities: string[]; excludeTags?: string[] };
  editable?: boolean;
  note?: string;
}) {
  return (
    <div className="text-sm space-y-2">
      <div>Возраст: {value.age[0]}–{value.age[1]}</div>
      <div>Радиус: {value.radiusKm} км</div>
      <div>Ценности: {value.valuedQualities?.length ? value.valuedQualities.join(', ') : '—'}</div>
      {value.excludeTags?.length ? <div>Исключить: {value.excludeTags.join(', ')}</div> : null}
      {note && <div className="text-xs text-gray-500">{note}</div>}

      {!editable ? null : (
        <button className="mt-2 px-3 py-2 rounded bg-zinc-900 text-white disabled:opacity-60" disabled>
          Изменить (скоро)
        </button>
      )}
    </div>
  );
}
