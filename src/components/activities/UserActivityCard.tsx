export type UserActVM = { id: string; title?: string; progress?: number };

export default function UserActivityCard(
  { activity, suggested }: { activity: UserActVM | null; suggested: UserActVM[] }
) {
  if (!activity && !suggested?.length) {
    return <div className="border rounded p-4 text-sm text-zinc-500">Р›РёС‡РЅС‹Рµ Р°РєС‚РёРІРЅРѕСЃС‚Рё РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ.</div>;
  }

  return (
    <div className="space-y-3">
      {activity && (
        <div className="border rounded p-4">
          <div className="font-medium">{activity.title ?? 'РўРµРєСѓС‰Р°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'}</div>
          {'progress' in activity && typeof activity.progress === 'number' && (
            <div className="text-xs text-zinc-500 mt-1">РїСЂРѕРіСЂРµСЃСЃ: {activity.progress}%</div>
          )}
        </div>
      )}
      {suggested?.map((s) => (
        <div key={s.id} className="border rounded p-4">
          <div className="font-medium">{s.title ?? 'РџСЂРµРґР»РѕР¶РµРЅРѕ'}</div>
        </div>
      ))}
    </div>
  );
}
