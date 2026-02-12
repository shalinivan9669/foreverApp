export type UserActVM = { id: string; title?: string; progress?: number };

type UserActivityCardProps = {
  activity: UserActVM | null;
  suggested: UserActVM[];
};

export default function UserActivityCard({ activity, suggested }: UserActivityCardProps) {
  if (!activity && !suggested?.length) {
    return (
      <div className="app-panel-soft app-panel-soft-solid p-4 text-sm app-muted">
        Р›РёС‡РЅС‹Рµ Р°РєС‚РёРІРЅРѕСЃС‚Рё РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity && (
        <div className="app-panel app-panel-solid p-4">
          <div className="font-display text-lg font-semibold leading-tight">{activity.title ?? 'РўРµРєСѓС‰Р°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'}</div>
          {typeof activity.progress === 'number' && (
            <div className="app-muted mt-1 text-xs">РїСЂРѕРіСЂРµСЃСЃ: {activity.progress}%</div>
          )}
        </div>
      )}

      {suggested?.map((entry) => (
        <div key={entry.id} className="app-panel-soft app-panel-soft-solid p-4">
          <div className="font-display text-lg font-semibold leading-tight">{entry.title ?? 'РџСЂРµРґР»РѕР¶РµРЅРѕ'}</div>
        </div>
      ))}
    </div>
  );
}

