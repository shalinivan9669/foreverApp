'use client';

type I18nText = Record<string, string>;
type CheckIn = {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];
  text: I18nText;
  weight?: number;
};

export type ActivityVM = {
  _id: string;
  title: I18nText;
  description?: I18nText;
  axis: string | string[];                 // ← может быть строкой или массивом
  archetype: string;
  intent: 'improve' | 'celebrate';
  difficulty: 1 | 2 | 3 | 4 | 5;
  intensity: 1 | 2 | 3;
  timeEstimateMin?: number;
  dueAt?: string;
  status: string;
  checkIns: CheckIn[];
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
  const { activity: a, locale, variant, onAccept, onCancel, onComplete, onSuggestNext } = props;

  const t = (txt?: I18nText) =>
    txt ? txt[locale] ?? txt['en'] ?? Object.values(txt)[0] ?? '' : '';

  const axisText = Array.isArray(a.axis) ? a.axis.join(', ') : a.axis;
  const badge =
    a.intent === 'celebrate'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div className="rounded border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${badge}`}>{a.intent}</span>
            {axisText && <span className="text-xs text-gray-500">{axisText}</span>}
            <span className="text-xs text-gray-500">• d{a.difficulty} • i{a.intensity}</span>
          </div>

          <h3 className="text-lg font-semibold mt-1">{t(a.title)}</h3>

          {a.description && (
            <p className="text-sm text-gray-600 mt-1">{t(a.description)}</p>
          )}

          {a.timeEstimateMin ? (
            <div className="text-xs text-gray-500 mt-1">~{a.timeEstimateMin} мин</div>
          ) : null}

          {a.dueAt ? (
            <div className="text-xs text-gray-500">
              до {new Date(a.dueAt).toLocaleString('ru-RU')}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {variant === 'suggested' && (
          <>
            <button onClick={onAccept} className="px-3 py-2 rounded bg-black text-white">
              Принять
            </button>
            <button onClick={onCancel} className="px-3 py-2 rounded border">
              Отклонить
            </button>
          </>
        )}

        {variant === 'active' && (
          <>
            <button onClick={onComplete} className="px-3 py-2 rounded bg-black text-white">
              Завершить
            </button>
            <button onClick={onCancel} className="px-3 py-2 rounded border">
              Отменить
            </button>
            <div className="flex-1" />
            <button onClick={onSuggestNext} className="px-3 py-2 rounded border">
              Предложить ещё
            </button>
          </>
        )}

        {variant === 'history' && (
          <span className="text-xs text-gray-500 self-center">status: {a.status}</span>
        )}
      </div>
    </div>
  );
}
