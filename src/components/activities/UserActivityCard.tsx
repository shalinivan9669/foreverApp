// src/components/activities/UserActivityCard.tsx
'use client';

export default function UserActivityCard({
  activity,
  suggested
}: {
  activity: null | { _id: string; title?: string; progress?: number };
  suggested: { _id?: string; title?: string }[];
}) {
  if (!activity && (!suggested || !suggested.length)) {
    return <div className="text-sm text-gray-600">Пока нет личных активностей</div>;
  }

  return (
    <div className="space-y-3">
      {activity && (
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500 mb-1">Текущая</div>
          <div className="font-medium">{activity.title ?? 'Активность'}</div>
          {typeof activity.progress === 'number' && (
            <div className="text-xs text-gray-600 mt-1">Прогресс: {activity.progress}%</div>
          )}
          <div className="mt-2">
            <button className="px-3 py-2 rounded bg-zinc-900 text-white disabled:opacity-60" disabled>Продолжить (скоро)</button>
          </div>
        </div>
      )}
      {suggested?.length ? (
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500 mb-2">Предложено</div>
          <ul className="space-y-2">
            {suggested.slice(0,3).map((s, i) => (
              <li key={s._id ?? i} className="p-2 bg-gray-50 rounded text-sm">
                {s.title ?? 'Идея активности'}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <button className="px-3 py-2 rounded border disabled:opacity-60" disabled>Предложить ещё (скоро)</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
