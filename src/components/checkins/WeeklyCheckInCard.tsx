'use client';

import { useEffect, useRef, useState } from 'react';
import { checkinsApi } from '@/client/api/checkins.api';
import {
  weeklyCyclesApi,
  type WeeklyCycleMemberStatus,
} from '@/client/api/weeklyCycles.api';
import type { WeeklyCheckInAnswersDTO, WeeklyCheckInDTO } from '@/client/api/types';

type WeeklyCheckInCardProps = {
  pairId?: string;
  cycleStatus?: WeeklyCycleMemberStatus;
  onSubmitted?: (checkIn: WeeklyCheckInDTO) => void | Promise<void>;
  onCycleChanged?: () => void | Promise<void>;
};

type WeeklyMetricKey = keyof Pick<
  WeeklyCheckInAnswersDTO,
  'closeness' | 'fatigue' | 'irritation' | 'readiness'
>;

type WeeklyCheckInDraft = Record<WeeklyMetricKey, number | null> & {
  unresolvedTopic: boolean | null;
  note: string;
};

const fields: Array<{
  key: WeeklyMetricKey;
  label: string;
}> = [
  { key: 'closeness', label: 'Близость' },
  { key: 'fatigue', label: 'Усталость' },
  { key: 'irritation', label: 'Раздражение' },
  { key: 'readiness', label: 'Готовность' },
];

const scaleOptions = [
  { value: 0, label: '0%' },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50% · нейтрально' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
] as const;

const createEmptyDraft = (): WeeklyCheckInDraft => ({
  closeness: null,
  fatigue: null,
  irritation: null,
  readiness: null,
  unresolvedTopic: null,
  note: '',
});

const toDraft = (answers: WeeklyCheckInAnswersDTO): WeeklyCheckInDraft => ({
  closeness: answers.closeness,
  fatigue: answers.fatigue,
  irritation: answers.irritation,
  readiness: answers.readiness,
  unresolvedTopic: answers.unresolvedTopic,
  note: answers.note ?? '',
});

const toCompleteAnswers = (
  draft: WeeklyCheckInDraft
): WeeklyCheckInAnswersDTO | null => {
  if (
    draft.closeness === null ||
    draft.fatigue === null ||
    draft.irritation === null ||
    draft.readiness === null ||
    draft.unresolvedTopic === null
  ) {
    return null;
  }

  const note = draft.note.trim();
  return {
    closeness: draft.closeness,
    fatigue: draft.fatigue,
    irritation: draft.irritation,
    readiness: draft.readiness,
    unresolvedTopic: draft.unresolvedTopic,
    ...(note ? { note } : {}),
  };
};

export default function WeeklyCheckInCard({
  pairId,
  cycleStatus,
  onSubmitted,
  onCycleChanged,
}: WeeklyCheckInCardProps) {
  return (
    <WeeklyCheckInCardSession
      key={pairId ?? 'personal'}
      pairId={pairId}
      cycleStatus={cycleStatus}
      onSubmitted={onSubmitted}
      onCycleChanged={onCycleChanged}
    />
  );
}

function WeeklyCheckInCardSession({
  pairId,
  cycleStatus,
  onSubmitted,
  onCycleChanged,
}: WeeklyCheckInCardProps) {
  const [answers, setAnswers] = useState<WeeklyCheckInDraft>(createEmptyDraft);
  const [current, setCurrent] = useState<WeeklyCheckInDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const skipConfirmationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (confirmSkip) skipConfirmationRef.current?.focus();
  }, [confirmSkip]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    checkinsApi
      .getCurrentWeekly({ pairId }, controller.signal)
      .then((payload) => {
        if (!active) return;
        setCurrent(payload.checkIn);
        if (payload.checkIn?.answers) setAnswers(toDraft(payload.checkIn.answers));
        setLoadFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setCurrent(null);
        setLoadFailed(true);
        setError('Не удалось загрузить еженедельную отметку. Проверьте соединение и повторите попытку.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAttempt, pairId]);

  const submit = async () => {
    const completeAnswers = toCompleteAnswers(answers);
    if (!completeAnswers) {
      setError('Выберите ответ для каждого обязательного пункта.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await checkinsApi.submitWeekly({ pairId, answers: completeAnswers });
      setCurrent(result);
      setAnswers(toDraft(result.answers));
      await onSubmitted?.(result);
    } catch {
      setError('Не удалось сохранить еженедельную отметку. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    if (!pairId) return;
    setSubmitting(true);
    setError(null);
    try {
      await weeklyCyclesApi.skipCurrent(pairId);
      setConfirmSkip(false);
      try {
        await onCycleChanged?.();
      } catch {
        setError('Цикл пропущен, но обновить экран не удалось. Перезагрузите страницу.');
      }
    } catch {
      setError('Не удалось пропустить этот цикл. Обновите страницу и попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const cycleLocked = cycleStatus === 'SKIPPED' || cycleStatus === 'EXPIRED';
  const controlsDisabled = loading || loadFailed || Boolean(current) || cycleLocked;
  const completeAnswers = toCompleteAnswers(answers);

  return (
    <div className="app-panel app-panel-solid p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Еженедельная отметка</h2>
          <p className="app-muted mt-1 text-sm">
            Короткая проверка состояния недели: ресурс, усталость и открытые темы.
          </p>
        </div>
        {(current || cycleLocked) && (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
            {current
              ? 'сохранено'
              : cycleStatus === 'SKIPPED'
                ? 'пропущено'
                : 'цикл завершён'}
          </span>
        )}
      </div>

      {loading && (
        <p className="app-muted mt-4 text-sm" role="status" aria-live="polite">
          Загружаем вашу отметку…
        </p>
      )}

      {loadFailed && (
        <div className="app-alert app-alert-error mt-4 text-sm" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadFailed(false);
              setError(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="app-btn-secondary mt-3 px-3 py-2 text-sm"
          >
            Повторить
          </button>
        </div>
      )}

      {!loadFailed && <div className="mt-4 space-y-3">
        {fields.map((field) => {
          const selectedValue = answers[field.key];
          return (
            <fieldset key={field.key} disabled={controlsDisabled} className="text-sm">
              <legend className="mb-2 flex w-full justify-between gap-2">
                <span>{field.label}</span>
                <span className="app-muted">
                  {selectedValue === null
                    ? 'не выбрано'
                    : `${Math.round(selectedValue * 100)}%`}
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {scaleOptions.map((option) => {
                  const selected = selectedValue === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setAnswers((previous) => ({
                          ...previous,
                          [field.key]: option.value,
                        }))
                      }
                      className={`${selected ? 'app-btn-primary' : 'app-btn-secondary'} px-2 py-2 text-xs disabled:opacity-60`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <fieldset disabled={controlsDisabled} className="text-sm">
          <legend className="mb-2">Есть нерешённая тема?</legend>
          <div className="flex gap-2">
            {[
              { value: true, label: 'Да' },
              { value: false, label: 'Нет' },
            ].map((option) => {
              const selected = answers.unresolvedTopic === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setAnswers((previous) => ({
                      ...previous,
                      unresolvedTopic: option.value,
                    }))
                  }
                  className={`${selected ? 'app-btn-primary' : 'app-btn-secondary'} min-w-20 px-3 py-2 text-sm disabled:opacity-60`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="mb-1 block">Личная заметка (только для вас)</span>
          <textarea
            value={answers.note}
            disabled={controlsDisabled}
            onChange={(event) => setAnswers((prev) => ({ ...prev, note: event.target.value }))}
            maxLength={500}
            className="w-full rounded border border-slate-200 bg-white p-2"
            rows={2}
          />
          <span className="app-muted mt-1 block text-xs">
            Не показывается партнёру и не входит в общую сводку.
          </span>
          <span className="app-muted mt-1 block text-right text-xs">
            {answers.note.length}/500
          </span>
        </label>
      </div>}

      {!completeAnswers && !current && !cycleLocked && !loading && !loadFailed && (
        <p className="app-muted mt-3 text-sm">
          Выберите значение для каждого пункта. Нейтральный ответ доступен как отдельный вариант.
        </p>
      )}

      {error && !loadFailed && (
        <div className="app-alert app-alert-error mt-3 text-sm" role="alert">{error}</div>
      )}

      {!loadFailed && <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void submit();
          }}
          disabled={
            loading || submitting || Boolean(current) || cycleLocked || !completeAnswers
          }
          className="app-btn-primary px-3 py-2 text-sm disabled:opacity-60"
        >
          {submitting
            ? 'Сохраняем...'
            : current
              ? 'Отметка сохранена'
              : cycleStatus === 'SKIPPED'
                ? 'Цикл пропущен'
                : cycleStatus === 'EXPIRED'
                  ? 'Цикл завершён'
                  : 'Сохранить отметку'}
        </button>
        {pairId && !current && (!cycleStatus || cycleStatus === 'PENDING') && (
          <button
            type="button"
            onClick={() => setConfirmSkip(true)}
            disabled={loading || submitting}
            aria-expanded={confirmSkip}
            aria-controls="weekly-skip-confirmation"
            className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
          >
            Пропустить без штрафа
          </button>
        )}
      </div>}

      {confirmSkip && !current && !cycleLocked && (
        <div
          ref={skipConfirmationRef}
          id="weekly-skip-confirmation"
          role="alertdialog"
          aria-labelledby="weekly-skip-confirmation-title"
          tabIndex={-1}
          className="app-alert app-alert-rate mt-4 text-sm outline-none"
        >
          <p id="weekly-skip-confirmation-title" className="font-semibold">
            Пропустить текущий цикл?
          </p>
          <p className="mt-1">
            Ответы не будут подставлены автоматически, а причина останется личной. Вернуться к этому циклу после пропуска нельзя.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void skip()}
              disabled={submitting}
              className="app-btn-primary px-3 py-2 text-sm disabled:opacity-60"
            >
              {submitting ? 'Пропускаем…' : 'Да, пропустить'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSkip(false)}
              disabled={submitting}
              className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
            >
              Вернуться к форме
            </button>
          </div>
        </div>
      )}

      {current && (
        <div className="app-panel-soft app-panel-soft-solid mt-4 p-3 text-sm">
          Ответ сохранён. Ваши точные значения и личная заметка видны только вам.
        </div>
      )}
    </div>
  );
}
