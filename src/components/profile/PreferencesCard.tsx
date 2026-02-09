// src/components/profile/PreferencesCard.tsx
'use client';

type PreferencesCardProps = {
  value: { age: [number, number]; radiusKm: number; valuedQualities: string[]; excludeTags?: string[] };
  editable?: boolean;
  note?: string;
};

export default function PreferencesCard({ value, editable = false, note }: PreferencesCardProps) {
  return (
    <div className="space-y-2 text-sm">
      <div>Возраст: {value.age[0]}-{value.age[1]}</div>
      <div>Радиус: {value.radiusKm} км</div>
      <div>Ценности: {value.valuedQualities?.length ? value.valuedQualities.join(', ') : '—'}</div>
      {value.excludeTags?.length ? <div>Исключить: {value.excludeTags.join(', ')}</div> : null}
      {note && <div className="app-muted text-xs">{note}</div>}

      {editable && (
        <button type="button" className="app-btn-secondary mt-2 px-3 py-2 text-sm disabled:opacity-60" disabled>
          Изменить (скоро)
        </button>
      )}
    </div>
  );
}
