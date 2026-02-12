// src/components/profile/SummaryTiles.tsx
'use client';

type SummaryTilesProps = {
  metrics: { streak: { individual: number }; completed: { individual: number } };
  readiness: { score: number };
  fatigue: { score: number };
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel-soft app-panel-soft-solid p-4">
      <div className="app-muted text-xs">{label}</div>
      <div className="font-display text-2xl font-semibold leading-tight">{value}</div>
    </div>
  );
}

export default function SummaryTiles({ metrics, readiness, fatigue }: SummaryTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Tile label="Streak (инд.)" value={String(metrics.streak.individual)} />
      <Tile label="Выполнено (инд.)" value={String(metrics.completed.individual)} />
      <Tile
        label="Готовность / Усталость"
        value={`${Math.round(readiness.score * 100)} / ${Math.round(fatigue.score * 100)}`}
      />
    </div>
  );
}
