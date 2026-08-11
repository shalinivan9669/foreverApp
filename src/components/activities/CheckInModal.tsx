'use client';

import { useEffect, useId, useRef, useState } from 'react';

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

type CheckInModalProps = {
  activity: Activity;
  locale: string;
  onClose: () => void;
  onSubmit: (answers: CheckInAnswer[], allowPairModelUse: boolean) => void;
  submitting?: boolean;
  pendingComplete?: boolean;
  pendingCompleteMessage?: string | null;
  onRetryComplete?: () => void;
  retryCompleteLoading?: boolean;
};

function CheckInModalForm(props: CheckInModalProps) {
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
  const [allowPairModelUse, setAllowPairModelUse] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

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
    onSubmit(submittedAnswers, allowPairModelUse);
  };

  const closeDisabled = submitting || retryCompleteLoading;
  const allAnswered = activityItem.checkIns.every(
    (checkIn) => typeof answers[checkIn.id] === 'number'
  ) && activityItem.checkIns.length > 0;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="app-dialog-layer fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={submitting || retryCompleteLoading}
        tabIndex={-1}
        className="app-panel max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto p-3 text-slate-900 outline-none sm:p-4"
      >
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="pr-3 text-lg font-semibold">Оцените: {t(activityItem.title)}</h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Закрыть окно обратной связи"
            className="app-btn-secondary h-11 w-11 shrink-0 px-2 py-1 text-xl text-slate-700 disabled:opacity-60"
          >
            ×
          </button>
        </div>
        <p id={descriptionId} className="app-muted mt-2 text-sm">
          Ответ нужен, чтобы понять, подошла ли задача вашей паре. Партнёр увидит
          только общий результат, не ваши отдельные ответы.
        </p>

        {pendingComplete && pendingCompleteMessage && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {pendingCompleteMessage}
          </div>
        )}

        <div className="mt-3 max-h-[60dvh] space-y-4 overflow-y-auto pr-1 sm:max-h-none sm:pr-0">
          {activityItem.checkIns.map((checkIn) => (
            <fieldset key={checkIn.id} className="space-y-2">
              <legend className="text-sm">{t(checkIn.text)}</legend>

              {checkIn.scale === 'likert5' ? (
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((ui) => (
                    <label key={ui} className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-sm">
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
                    {checkIn.id === 'difficulty'
                      ? '1 — совсем легко, 3 — умеренно, 5 — очень сложно'
                      : '1 — совсем нет / стало хуже, 3 — нейтрально, 5 — да / стало лучше'}
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
                      <label key={ui} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm">
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
            </fieldset>
          ))}
          {activityItem.checkIns.length === 0 && (
            <div className="app-alert app-alert-rate text-sm" role="status">
              Вопросы обратной связи пока недоступны. Закройте окно и обновите активности.
            </div>
          )}
        </div>

        <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={allowPairModelUse}
            disabled={submitting || pendingComplete}
            onChange={(event) => setAllowPairModelUse(event.target.checked)}
          />
          <span>
            Разрешить использовать этот отзыв только в обезличенном расчёте пары.
            Точные ответы партнёру не показываются. Без разрешения отзыв останется
            только личным.
          </span>
        </label>

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

export default function CheckInModal(props: CheckInModalProps) {
  return <CheckInModalForm key={props.activity._id} {...props} />;
}
