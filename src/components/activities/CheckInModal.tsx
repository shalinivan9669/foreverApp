'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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

  const requestClose = () => {
    if (closeDisabled) return;
    if (!pendingComplete && (Object.keys(answers).length > 0 || allowPairModelUse)) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog
        open
        onClose={requestClose}
        title={`Оцените: ${t(activityItem.title)}`}
        description="Ответ нужен, чтобы понять, подошла ли задача вашей паре. Партнёр увидит только общий результат, не ваши отдельные ответы."
        busy={closeDisabled}
        closeLabel="Закрыть окно обратной связи"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={closeDisabled}
              className="app-btn-secondary"
            >
              Отмена
            </button>
            {pendingComplete ? (
              <button
                type="button"
                onClick={onRetryComplete}
                disabled={!onRetryComplete || retryCompleteLoading}
                className="app-btn-primary"
              >
                {retryCompleteLoading ? 'Завершаем…' : 'Завершить ещё раз'}
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !allAnswered}
                className="app-btn-primary"
              >
                {submitting ? 'Отправка…' : 'Отправить'}
              </button>
            )}
          </div>
        )}
      >
        {pendingComplete && pendingCompleteMessage && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {pendingCompleteMessage}
          </div>
        )}

        <div className="space-y-4">
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

        {!pendingComplete && !allAnswered && (
          <p className="app-muted mt-3 text-sm">Чтобы отправить отзыв, ответьте на каждый вопрос.</p>
        )}
      </Dialog>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Закрыть без отправки?"
        description="Ответы пока хранятся только в этом окне. При закрытии они не сохранятся."
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="app-btn-secondary" onClick={() => setConfirmDiscard(false)}>
              Продолжить отвечать
            </button>
            <button type="button" className="app-btn-danger" onClick={onClose}>Закрыть без отправки</button>
          </div>
        )}
      >
        <p className="text-sm">Можно вернуться к отзыву и отправить его, когда будете готовы.</p>
      </Dialog>
    </>
  );
}

export default function CheckInModal(props: CheckInModalProps) {
  return <CheckInModalForm key={props.activity._id} {...props} />;
}
