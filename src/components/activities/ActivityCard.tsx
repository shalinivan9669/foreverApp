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
  axis: string | string[];
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
    txt ? txt[locale] ?? txt.en ?? Object.values(txt)[0] ?? '' : '';

  const axisText = Array.isArray(a.axis) ? a.axis.join(', ') : a.axis;
  const badge =
    a.intent === 'celebrate'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div className="app-panel p-4 text-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>{a.intent}</span>
            {axisText && <span className="app-muted text-xs">{axisText}</span>}
            <span className="app-muted text-xs">- d{a.difficulty} - i{a.intensity}</span>
          </div>

          <h3 className="mt-1 text-lg font-semibold">{t(a.title)}</h3>

          {a.description && <p className="app-muted mt-1 text-sm">{t(a.description)}</p>}

          {a.timeEstimateMin ? (
            <div className="app-muted mt-1 text-xs">~{a.timeEstimateMin} РјРёРЅ</div>
          ) : null}

          {a.dueAt ? (
            <div className="app-muted text-xs">РґРѕ {new Date(a.dueAt).toLocaleString('ru-RU')}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {variant === 'suggested' && (
          <>
            <button onClick={onAccept} className="app-btn-primary px-3 py-2">
              РџСЂРёРЅСЏС‚СЊ
            </button>
            <button onClick={onCancel} className="app-btn-secondary px-3 py-2">
              РћС‚РєР»РѕРЅРёС‚СЊ
            </button>
          </>
        )}

        {variant === 'active' && (
          <>
            <button onClick={onComplete} className="app-btn-primary px-3 py-2">
              Р—Р°РІРµСЂС€РёС‚СЊ
            </button>
            <button onClick={onCancel} className="app-btn-secondary px-3 py-2">
              РћС‚РјРµРЅРёС‚СЊ
            </button>
            <div className="flex-1" />
            <button onClick={onSuggestNext} className="app-btn-secondary px-3 py-2">
              РџСЂРµРґР»РѕР¶РёС‚СЊ РµС‰Рµ
            </button>
          </>
        )}

        {variant === 'history' && (
          <span className="app-muted self-center text-xs">status: {a.status}</span>
        )}
      </div>
    </div>
  );
}
