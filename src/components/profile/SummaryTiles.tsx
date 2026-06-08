// src/components/profile/SummaryTiles.tsx
'use client';

type SummaryTilesProps = {
  metrics: { streak: { individual: number }; completed: { individual: number } };
  readiness: { score: number };
  fatigue: { score: number };
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel-soft app-panel-soft-solid p-4 sm:p-5">
      <div className="app-muted text-sm">{label}</div>
      <div className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{value}</div>
    </div>
  );
}

export default function SummaryTiles({ metrics, readiness, fatigue }: SummaryTilesProps) {
  return (
    <div className="app-metric-grid">
      <Tile label="Streak (инд.)" value={String(metrics.streak.individual)} />
      <Tile label="Выполнено (инд.)" value={String(metrics.completed.individual)} />
      <Tile
        label="Готовность / Усталость"
        value={`${Math.round(readiness.score * 100)} / ${Math.round(fatigue.score * 100)}`}
      />
    </div>
  );
}
