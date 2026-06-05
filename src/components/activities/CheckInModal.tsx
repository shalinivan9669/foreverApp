'use client';

import { useEffect, useState } from 'react';

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

  const t = (txt?: I18nText) => (txt ? txt[locale] ?? txt.en ?? Object.values(txt)[0] : '');

  const [answers, setAnswers] =
    useState<Partial<Record<string, number>>>({});

  useEffect(() => {
    setAnswers({});
  }, [activityItem._id]);

  const handleChange = (id: string, ui: number) => {
    if (submitting || pendingComplete) return;
    setAnswers((current) => ({ ...current, [id]: ui }));
  };

  const submit = () => {
    if (submitting || pendingComplete) return;
    if (activityItem.checkIns.some((checkIn) => !answers[checkIn.id])) return;
    const submittedAnswers: CheckInAnswer[] = activityItem.checkIns.map((checkIn) => ({
      checkInId: checkIn.id,
      ui: Number(answers[checkIn.id]),
    }));
    onSubmit(submittedAnswers);
  };

  const closeDisabled = submitting || retryCompleteLoading;
  const allAnswered = activityItem.checkIns.every(
    (checkIn) => typeof answers[checkIn.id] === 'number'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-2 sm:items-center sm:p-3">
      <div className="app-panel w-full max-w-lg p-3 text-slate-900 sm:p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Оцените: {t(activityItem.title)}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="app-btn-secondary px-2 py-1 text-slate-700 disabled:opacity-60"
          >
            x
          </button>
        </div>
        <p className="app-muted mt-2 text-sm">
          Ответ нужен, чтобы понять, подошла ли задача вашей паре. Партнёр увидит
          только общий результат, не ваши отдельные ответы.
        </p>

        {pendingComplete && pendingCompleteMessage && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {pendingCompleteMessage}
          </div>
        )}

        <div className="mt-3 max-h-[60dvh] space-y-4 overflow-y-auto pr-1 sm:max-h-none sm:pr-0">
          {activityItem.checkIns.map((checkIn) => (
            <div key={checkIn.id} className="space-y-1">
              <div className="text-sm">{t(checkIn.text)}</div>

              {checkIn.scale === 'likert5' ? (
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((ui) => (
                    <label key={ui} className="flex items-center gap-1 text-xs">
                      <input
                        name={checkIn.id}
                        type="radio"
                        checked={answers[checkIn.id] === ui}
                        disabled={submitting || pendingComplete}
                        onChange={() => handleChange(checkIn.id, ui)}
                      />
                      {ui}
                    </label>
                  ))}
                  <div className="app-muted basis-full text-xs">
                    1 — совсем нет / стало хуже, 3 — нейтрально, 5 — да / стало лучше
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {[1, 2].map((ui) => {
                    const otherUi = ui === 1 ? 2 : 1;
                    const label =
                      (checkIn.map[ui - 1] ?? 0) >=
                      (checkIn.map[otherUi - 1] ?? 0)
                        ? 'Да'
                        : 'Нет';
                    return (
                      <label key={ui} className="flex items-center gap-1 text-xs">
                        <input
                          name={checkIn.id}
                          type="radio"
                          checked={answers[checkIn.id] === ui}
                          disabled={submitting || pendingComplete}
                          onChange={() => handleChange(checkIn.id, ui)}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="app-btn-secondary px-3 py-2 text-slate-800 disabled:opacity-60"
          >
            Отмена
          </button>
          {pendingComplete ? (
            <button
              type="button"
              onClick={onRetryComplete}
              disabled={!onRetryComplete || retryCompleteLoading}
              className="app-btn-primary px-3 py-2 text-white disabled:opacity-60"
            >
              {retryCompleteLoading ? 'Завершаем...' : 'Завершить еще раз'}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !allAnswered}
              className="app-btn-primary px-3 py-2 text-white disabled:opacity-60"
            >
              {submitting ? 'Отправка...' : 'Отправить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
