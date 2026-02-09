export type UserActVM = { id: string; title?: string; progress?: number };

type UserActivityCardProps = {
  activity: UserActVM | null;
  suggested: UserActVM[];
};

export default function UserActivityCard({ activity, suggested }: UserActivityCardProps) {
  if (!activity && !suggested?.length) {
    return (
      <div className="app-panel-soft p-4 text-sm app-muted">
        Личные активности появятся здесь.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity && (
        <div className="app-panel p-4">
          <div className="font-medium">{activity.title ?? 'Текущая активность'}</div>
          {typeof activity.progress === 'number' && (
            <div className="app-muted mt-1 text-xs">прогресс: {activity.progress}%</div>
          )}
        </div>
      )}

      {suggested?.map((entry) => (
        <div key={entry.id} className="app-panel-soft p-4">
          <div className="font-medium">{entry.title ?? 'Предложено'}</div>
        </div>
      ))}
    </div>
  );
}
