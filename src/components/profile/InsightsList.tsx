type Axis = 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';

export type InsightVM = {
  id: string;
  pairId?: string;
  title?: string;
  axis?: Axis;
  severity?: 1 | 2 | 3;
  safeWording?: string;
  recommendedAction?: string;
  activityId?: string;
  questionnaireId?: string;
  delta?: number;
};

type InsightsListProps = {
  items: InsightVM[];
  pairId?: string;
};

const actionHref = (item: InsightVM, pairId?: string): string | null => {
  if (item.activityId) return '/couple-activity';
  if (!item.questionnaireId) return null;
  const targetPairId = pairId ?? item.pairId;
  return targetPairId
    ? `/pair/${targetPairId}/questionnaire/${item.questionnaireId}`
    : `/questionnaire/${item.questionnaireId}`;
};

export default function InsightsList({ items, pairId }: InsightsListProps) {
  if (!items?.length) {
    return (
      <div className="app-muted text-sm">
        Пока недостаточно данных для инсайтов. Пройдите короткую анкету, чтобы уточнить профиль.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const href = actionHref(item, pairId);
        return (
          <li key={item.id} className="app-panel-soft app-panel-soft-solid p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium">{item.title ?? item.axis ?? 'Инсайт'}</div>
              {item.severity && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  S{item.severity}
                </span>
              )}
            </div>
            {item.safeWording && <p className="app-muted mt-2">{item.safeWording}</p>}
            {item.recommendedAction && (
              <div className="mt-2">
                <span className="app-muted">Действие: </span>
                {item.recommendedAction}
              </div>
            )}
            {typeof item.delta === 'number' && (
              <div className="app-muted mt-1">
                {item.delta > 0 ? `+${item.delta}` : item.delta}
              </div>
            )}
            {href ? (
              <a href={href} className="app-btn-secondary mt-3 inline-flex px-3 py-2">
                Попробовать короткое действие
              </a>
            ) : (
              item.recommendedAction && (
                <div className="app-muted mt-3 text-xs">Попробовать короткое действие</div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
