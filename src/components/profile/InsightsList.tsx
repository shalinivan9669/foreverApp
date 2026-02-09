type Axis = 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';

export type InsightVM = {
  id: string;
  title?: string;
  axis?: Axis;
  delta?: number;
};

export default function InsightsList({ items }: { items: InsightVM[] }) {
  if (!items?.length) {
    return <div className="app-muted text-sm">Инсайтов пока нет</div>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          {item.title ?? item.axis}{' '}
          {typeof item.delta === 'number' && (
            <span className="app-muted ml-2">{item.delta > 0 ? `+${item.delta}` : item.delta}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
