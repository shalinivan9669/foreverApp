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

const AXIS_LABELS: Record<Axis, string> = {
  communication: 'Коммуникация',
  domestic: 'Быт',
  personalViews: 'Личные взгляды',
  finance: 'Финансы',
  sexuality: 'Близость',
  psyche: 'Ресурс',
};

const SEVERITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'слабый сигнал',
  2: 'средний риск',
  3: 'высокий риск',
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
              <div className="font-medium">
                {item.title ?? (item.axis ? AXIS_LABELS[item.axis] : 'Инсайт')}
              </div>
              {item.severity && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {SEVERITY_LABELS[item.severity]}
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
                Разница: {item.delta > 0 ? `+${item.delta}` : item.delta}
              </div>
            )}
            {href ? (
              <a href={href} className="app-btn-secondary mt-3 inline-flex px-3 py-2">
                Открыть следующий шаг
              </a>
            ) : (
              item.recommendedAction && (
                <div className="app-muted mt-3 text-xs">Следующий шаг можно выбрать в активностях.</div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
