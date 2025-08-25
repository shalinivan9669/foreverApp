export type UserActVM = { _id: string; title?: string; progress?: number };

export default function UserActivityCard(
  { activity, suggested }: { activity: UserActVM | null; suggested: UserActVM[] }
) {
  if (!activity && !suggested?.length) {
    return <div className="border rounded p-4 text-sm text-zinc-500">Личные активности появятся здесь.</div>;
  }

  return (
    <div className="space-y-3">
      {activity && (
        <div className="border rounded p-4">
          <div className="font-medium">{activity.title ?? 'Текущая активность'}</div>
          {'progress' in activity && typeof activity.progress === 'number' && (
            <div className="text-xs text-zinc-500 mt-1">прогресс: {activity.progress}%</div>
          )}
        </div>
      )}
      {suggested?.map(s => (
        <div key={s._id} className="border rounded p-4">
          <div className="font-medium">{s.title ?? 'Предложено'}</div>
        </div>
      ))}
    </div>
  );
}
