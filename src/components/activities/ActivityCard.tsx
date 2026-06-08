'use client';

import type { ActivityI18nText } from '@/client/api/types';
import type { ActivityCardVM } from '@/client/viewmodels';

export default function ActivityCard(props: {
  activity: ActivityCardVM;
  locale: string;
  variant: 'active' | 'suggested' | 'history';
  onAccept: () => void;
  onCancel: () => void;
  onComplete: () => void;
  onSuggestNext: () => void;
}) {
  const { activity: activity, locale, variant, onAccept, onCancel, onComplete } =
    props;

  const text = (value?: ActivityI18nText | Record<string, string>) =>
    value
      ? Object.entries(value).find(([key]) => key === locale)?.[1] ??
        value.en ??
        Object.values(value)[0] ??
        ''
      : '';

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
  const axes = Array.isArray(activity.axis) ? activity.axis : [activity.axis];
  const axisText = axes
    .map((axis) => axisLabels[axis] ?? 'Общая')
    .join(', ');
  const difficultyText =
    activity.difficulty <= 2
      ? 'Легко'
      : activity.difficulty === 3
        ? 'Средне'
        : 'Сложно';
  const intensityText =
    activity.intensity === 1
      ? 'Мягко'
      : activity.intensity === 2
        ? 'Умеренно'
        : 'Интенсивно';
  const badge =
    activity.intent === 'celebrate'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';
  const result = activity.resultSummary;
  const resultPercent = Math.round(
    (result?.successScore ?? activity.successScore ?? 0) * 100
  );
  const signedPercent = (value: number): string =>
    `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;

  return (
    <div className="app-panel app-lift flex h-full min-h-[20rem] flex-col p-4 text-slate-900 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>
              {activity.intent === 'celebrate' ? 'Поддержка' : 'Развитие'}
            </span>
            {axisText && <span className="app-muted text-xs">{axisText}</span>}
            <span className="app-muted text-xs">{difficultyText}</span>
            <span className="app-muted text-xs">{intensityText}</span>
            {activity.requiresConsent && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                Только по взаимному согласию
              </span>
            )}
            {activity.eventSourceBadge && (
              <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                {activity.eventSourceBadge.label}
                {activity.eventSourceBadge.reason ? ` · ${activity.eventSourceBadge.reason}` : ''}
              </span>
            )}
          </div>

          <h3 className="font-display mt-2 text-xl font-semibold leading-tight sm:text-2xl">
            {text(activity.title)}
          </h3>

          {activity.description && (
            <p className="app-muted app-reading-width mt-2 text-sm leading-6">
              {text(activity.description)}
            </p>
          )}

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Почему предложено
            </div>
            <p className="mt-1 text-slate-700">{text(activity.why)}</p>
          </div>

          {activity.timeEstimateMin ? (
            <div className="app-muted mt-2 text-xs">
              Примерно {activity.timeEstimateMin} мин
            </div>
          ) : null}

          {activity.dueAt ? (
            <div className="app-muted text-xs">
              до {new Date(activity.dueAt).toLocaleString('ru-RU')}
            </div>
          ) : null}

          {variant === 'active' && activity.status === 'awaiting_checkin' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Ожидает обратную связь. Можно завершить с одним ответом, но
              результат будет предварительным.
            </div>
          )}

          {variant === 'history' && result && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="font-medium">
                {statusLabels[result.status]} · результат {resultPercent}%
              </div>
              <div className="app-muted">
                {result.bothSubmitted
                  ? 'Ответили оба'
                  : `Ответил ${result.submittedCount} из 2`}
              </div>
              <p className="text-slate-700">
                {text(result.effectExplanation)}
              </p>
              {result.effectApplied ? (
                <div className="app-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>
                    Готовность{' '}
                    {signedPercent(result.effect.readinessDelta)}
                  </span>
                  <span>
                    Усталость {signedPercent(result.effect.fatigueDelta)}
                  </span>
                  {result.effect.axisDeltas.map((item) => (
                    <span key={item.axis}>
                      {axisLabels[item.axis] ?? item.axis}{' '}
                      {signedPercent(item.delta)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="app-muted text-xs">
                  Состояние пары не изменялось.
                </div>
              )}
              {result.completedAt && (
                <div className="app-muted text-xs">
                  {new Date(result.completedAt).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          )}

          {variant === 'history' && !result && (
            <div className="app-muted mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              Старая активность — результата ещё нет.
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {variant === 'suggested' && (
          <>
            <button
              onClick={onAccept}
              className="app-btn-primary w-full px-3 py-2 sm:w-auto"
            >
              Принять
            </button>
            <button
              onClick={onCancel}
              className="app-btn-secondary w-full px-3 py-2 sm:w-auto"
            >
              Не сейчас
            </button>
          </>
        )}

        {variant === 'active' && (
          <>
            <button
              onClick={onComplete}
              className="app-btn-primary w-full px-3 py-2 sm:w-auto"
            >
              {activity.status === 'awaiting_checkin'
                ? 'Оставить отзыв / завершить'
                : 'Завершить'}
            </button>
            <button
              onClick={onCancel}
              className="app-btn-secondary w-full px-3 py-2 sm:w-auto"
            >
              Отменить
            </button>
          </>
        )}

        {variant === 'history' && (
          <>
            <span className="app-muted self-center text-xs">
              {statusLabels[activity.status] ?? 'Завершено'}
            </span>
            {result?.submittedCount === 1 &&
              activity.status === 'completed_partial' && (
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
