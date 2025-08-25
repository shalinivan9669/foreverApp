// src/components/profile/SummaryTiles.tsx
'use client';

export default function SummaryTiles({
  metrics, readiness, fatigue
}: {
  metrics: { streak: { individual: number }, completed: { individual: number } };
  readiness: { score: number };
  fatigue: { score: number };
}) {
  const Tile = ({ label, value }: { label: string; value: string }) => (
    <div className="border rounded p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
  return (
    <>
      <Tile label="Streak (инд.)" value={String(metrics.streak.individual)} />
      <Tile label="Выполнено (инд.)" value={String(metrics.completed.individual)} />
      <Tile label="Готовность / Усталость" value={`${Math.round(readiness.score*100)} / ${Math.round(fatigue.score*100)}`} />
    </>
  );
}
