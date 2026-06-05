'use client';

type I18nText = Record<string, string>;
type CheckIn = {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];
  text: I18nText;
  weight?: number;
};
type ActivityResultSummary = {
  submittedCount: number;
  bothSubmitted: boolean;
  successScore: number;
  status: 'completed_success' | 'completed_partial' | 'failed';
  effectApplied: boolean;
  effect: {
    fatigueDelta: number;
    readinessDelta: number;
    axisDeltas: Array<{ axis: string; delta: number }>;
  };
  effectExplanation: I18nText;
  completedAt?: string;
};

export type ActivityVM = {
  _id: string;
  title: I18nText;
  description?: I18nText;
  why: I18nText;
  axis: string | string[];
  archetype: string;
  intent: 'improve' | 'celebrate';
  mode: 'together' | 'soloA' | 'soloB';
  sync: 'sync' | 'async';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  requiresConsent?: boolean;
  dueAt?: string;
  status: string;
  checkIns: CheckIn[];
  successScore?: number;
  resultSummary?: ActivityResultSummary;
};

export default function ActivityCard(props: {
  activity: ActivityVM;
  locale: string;
  variant: 'active' | 'suggested' | 'history';
  onAccept: () => void;
  onCancel: () => void;
  onComplete: () => void;
  onSuggestNext: () => void;
}) {
  const { activity: a, locale, variant, onAccept, onCancel, onComplete } = props;

  const t = (txt?: I18nText) => txt ? txt[locale] ?? txt.en ?? Object.values(txt)[0] ?? '' : '';

  const axisLabels: Record<string, string> = {
    communication: 'Коммуникация',
    domestic: 'Быт',
    finance: 'Финансы',
    sexuality: 'Близость',
    personalViews: 'Личные взгляды',
    psyche: 'Ресурс',
  };
  const statusLabels: Record<string, string> = {
    completed_success: 'Выполнено',
    completed_partial: 'Частично',
    failed: 'Не зашло',
    cancelled: 'Отложено',
    expired: 'Срок завершён',
  };
  const axes = Array.isArray(a.axis) ? a.axis : [a.axis];
  const axisText = axes.map((axis) => axisLabels[axis] ?? 'Общая').join(', ');
  const difficultyText = a.difficulty <= 2 ? 'Легко' : a.difficulty === 3 ? 'Средне' : 'Сложно';
  const intensityText = a.intensity === 1 ? 'Мягко' : a.intensity === 2 ? 'Умеренно' : 'Интенсивно';
  const badge = a.intent === 'celebrate' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
  const result = a.resultSummary;
  const percent = Math.round((result?.successScore ?? a.successScore ?? 0) * 100);
  const signedPercent = (value: number): string =>
    `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;

  return (
    <div className="app-panel app-lift h-full p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>
              {a.intent === 'celebrate' ? 'Поддержка' : 'Развитие'}
            </span>
            {axisText && <span className="app-muted text-xs">{axisText}</span>}
            <span className="app-muted text-xs">{difficultyText}</span>
            <span className="app-muted text-xs">{intensityText}</span>
            {a.requiresConsent && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                Только по взаимному согласию
              </span>
            )}
          </div>

          <h3 className="font-display mt-1 text-lg font-semibold leading-tight">{t(a.title)}</h3>

          {a.description && <p className="app-muted mt-1 text-sm">{t(a.description)}</p>}

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Почему предложено
            </div>
            <p className="mt-1 text-slate-700">{t(a.why)}</p>
          </div>

          {a.timeEstimateMin ? <div className="app-muted mt-2 text-xs">Примерно {a.timeEstimateMin} мин</div> : null}

          {a.dueAt ? <div className="app-muted text-xs">до {new Date(a.dueAt).toLocaleString('ru-RU')}</div> : null}

          {variant === 'active' && a.status === 'awaiting_checkin' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Ожидает обратную связь. Можно завершить с одним ответом, но результат
              останется предварительным.
            </div>
          )}

          {variant === 'history' && result && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{statusLabels[result.status]}</span>
                <span className="app-muted">результат {percent}%</span>
                <span className="app-muted">
                  {result.bothSubmitted ? 'ответили оба' : `ответил ${result.submittedCount} из 2`}
                </span>
              </div>
              <p className="text-slate-700">{t(result.effectExplanation)}</p>
              {result.effectApplied && (
                <div className="app-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>Готовность {signedPercent(result.effect.readinessDelta)}</span>
                  <span>Усталость {signedPercent(result.effect.fatigueDelta)}</span>
                  {result.effect.axisDeltas.map((item) => (
                    <span key={item.axis}>
                      {axisLabels[item.axis] ?? item.axis} {signedPercent(item.delta)}
                    </span>
                  ))}
                </div>
              )}
              {result.completedAt && (
                <div className="app-muted text-xs">
                  {new Date(result.completedAt).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {variant === 'suggested' && (
          <>
            <button onClick={onAccept} className="app-btn-primary w-full px-3 py-2 sm:w-auto">Принять</button>
            <button onClick={onCancel} className="app-btn-secondary w-full px-3 py-2 sm:w-auto">Не сейчас</button>
          </>
        )}

        {variant === 'active' && (
          <>
            <button onClick={onComplete} className="app-btn-primary w-full px-3 py-2 sm:w-auto">
              {a.status === 'awaiting_checkin' ? 'Оставить отзыв / завершить' : 'Завершить'}
            </button>
            <button onClick={onCancel} className="app-btn-secondary w-full px-3 py-2 sm:w-auto">Отменить</button>
          </>
        )}

        {variant === 'history' && (
          <>
            <span className="app-muted self-center text-xs">
              {statusLabels[a.status] ?? 'Завершено'}
            </span>
            {result?.submittedCount === 1 && (
              <button
                onClick={onComplete}
                className="app-btn-secondary w-full px-3 py-2 sm:w-auto"
              >
                Добавить или обновить отзыв
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
