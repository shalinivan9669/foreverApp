type Axis = 'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';

export type InsightVM = {
  _id: string;
  title?: string;
  axis?: Axis;
  delta?: number;
};

export default function InsightsList({ items }: { items: InsightVM[] }) {
  if (!items?.length) return <div className="text-sm text-zinc-500">Инсайтов пока нет</div>;
  return (
    <ul className="space-y-2">
      {items.map(x => (
        <li key={x._id} className="text-sm">
          {x.title ?? x.axis}{' '}
          {typeof x.delta === 'number' && (
            <span className="ml-2 text-zinc-500">{x.delta > 0 ? `+${x.delta}` : x.delta}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
