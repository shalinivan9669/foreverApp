'use client';

import { useEffect, useMemo, useRef } from 'react';

type I18nText = Record<string, string>;
type CheckIn = {
  id: string;
  scale: 'likert5' | 'bool';
  map: number[];
  text: I18nText;
  weight?: number;
};
type Activity = { _id: string; title: I18nText; checkIns: CheckIn[] };

type CheckInAnswer = { checkInId: string; ui: number };

export default function CheckInModal(props: {
  activity: Activity;
  locale: string;
  onClose: () => void;
  onSubmit: (answers: CheckInAnswer[]) => void;
  submitting?: boolean;
  pendingComplete?: boolean;
  pendingCompleteMessage?: string | null;
  onRetryComplete?: () => void;
  retryCompleteLoading?: boolean;
}) {
  const {
    activity: activityItem,
    locale,
    onClose,
    onSubmit,
    submitting = false,
    pendingComplete = false,
    pendingCompleteMessage,
    onRetryComplete,
    retryCompleteLoading = false,
  } = props;

  const t = (txt?: I18nText) => txt ? txt[locale] ?? txt.en ?? Object.values(txt)[0] : '';

  const initialAnswers = useMemo(
    () => Object.fromEntries(activityItem.checkIns.map((checkIn) => [checkIn.id, 1])) as Record<string, number>,
    [activityItem.checkIns]
  );

  const answersRef = useRef<Record<string, number>>(initialAnswers);

  useEffect(() => {
    answersRef.current = initialAnswers;
  }, [initialAnswers, activityItem._id]);

  const handleChange = (id: string, ui: number) => {
    if (submitting || pendingComplete) return;
    answersRef.current[id] = ui;
  };

  const submit = () => {
    if (submitting || pendingComplete) return;
    const answers: CheckInAnswer[] = activityItem.checkIns.map((checkIn) => ({
      checkInId: checkIn.id,
      ui: Number(answersRef.current[checkIn.id] ?? 1),
    }));
    onSubmit(answers);
  };

  const closeDisabled = submitting || retryCompleteLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3">
      <div className="app-panel w-full max-w-lg p-4 text-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">РћС†РµРЅРёС‚Рµ: {t(activityItem.title)}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="app-btn-secondary px-2 py-1 text-slate-700 disabled:opacity-60"
          >
            x
          </button>
        </div>

        {pendingComplete && pendingCompleteMessage && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {pendingCompleteMessage}
          </div>
        )}

        <div className="mt-3 space-y-4">
          {activityItem.checkIns.map((checkIn) => (
            <div key={checkIn.id} className="space-y-1">
              <div className="text-sm">{t(checkIn.text)}</div>

              {checkIn.scale === 'likert5' ? (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((ui) => (
                    <label key={ui} className="flex items-center gap-1 text-xs">
                      <input
                        name={checkIn.id}
                        type="radio"
                        defaultChecked={ui === 1}
                        disabled={submitting || pendingComplete}
                        onChange={() => handleChange(checkIn.id, ui)}
                      />
                      {ui}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      name={checkIn.id}
                      type="radio"
                      defaultChecked
                      disabled={submitting || pendingComplete}
                      onChange={() => handleChange(checkIn.id, 1)}
                    />
                    Р”Р°
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      name={checkIn.id}
                      type="radio"
                      disabled={submitting || pendingComplete}
                      onChange={() => handleChange(checkIn.id, 2)}
                    />
                    РќРµС‚
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="app-btn-secondary px-3 py-2 text-slate-800 disabled:opacity-60"
          >
            РћС‚РјРµРЅР°
          </button>
          {pendingComplete ? (
            <button
              type="button"
              onClick={onRetryComplete}
              disabled={!onRetryComplete || retryCompleteLoading}
              className="app-btn-primary px-3 py-2 text-white disabled:opacity-60"
            >
              {retryCompleteLoading ? 'Р—Р°РІРµСЂС€Р°РµРј...' : 'Р—Р°РІРµСЂС€РёС‚СЊ РµС‰Рµ СЂР°Р·'}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="app-btn-primary px-3 py-2 text-white disabled:opacity-60"
            >
              {submitting ? 'РћС‚РїСЂР°РІРєР°...' : 'РћС‚РїСЂР°РІРёС‚СЊ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
