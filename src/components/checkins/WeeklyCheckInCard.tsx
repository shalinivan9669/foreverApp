'use client';

import { useEffect, useState } from 'react';
import { checkinsApi } from '@/client/api/checkins.api';
import type { WeeklyCheckInAnswersDTO, WeeklyCheckInDTO } from '@/client/api/types';
import InsightsList from '@/components/profile/InsightsList';

type WeeklyCheckInCardProps = {
  pairId?: string;
};

const initialAnswers: WeeklyCheckInAnswersDTO = {
  closeness: 0.5,
  fatigue: 0.5,
  irritation: 0.3,
  readiness: 0.5,
  unresolvedTopic: false,
};

const fields: Array<{
  key: keyof Pick<WeeklyCheckInAnswersDTO, 'closeness' | 'fatigue' | 'irritation' | 'readiness'>;
  label: string;
}> = [
  { key: 'closeness', label: 'Близость' },
  { key: 'fatigue', label: 'Усталость' },
  { key: 'irritation', label: 'Раздражение' },
  { key: 'readiness', label: 'Готовность' },
];

export default function WeeklyCheckInCard({ pairId }: WeeklyCheckInCardProps) {
  const [answers, setAnswers] = useState<WeeklyCheckInAnswersDTO>(initialAnswers);
  const [current, setCurrent] = useState<WeeklyCheckInDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    checkinsApi
      .getCurrentWeekly({ pairId }, controller.signal)
      .then((payload) => {
        if (!active) return;
        setCurrent(payload.checkIn);
        if (payload.checkIn?.answers) setAnswers(payload.checkIn.answers);
      })
      .catch(() => {
        if (!active) return;
        setCurrent(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pairId]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await checkinsApi.submitWeekly({ pairId, answers });
      setCurrent(result);
    } catch {
      setError('Не удалось сохранить weekly check-in. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-panel app-panel-solid p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Weekly check-in</h2>
          <p className="app-muted mt-1 text-sm">
            Короткая проверка состояния недели: ресурс, усталость и открытые темы.
          </p>
        </div>
        {current && <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">сохранено</span>}
      </div>

      <div className="mt-4 space-y-3">
        {fields.map((field) => (
          <label key={field.key} className="block text-sm">
            <div className="mb-1 flex justify-between">
              <span>{field.label}</span>
              <span className="app-muted">{Math.round(Number(answers[field.key]) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(Number(answers[field.key]) * 100)}
              onChange={(event) => {
                const next = Number(event.target.value) / 100;
                setAnswers((prev) => ({ ...prev, [field.key]: next }));
              }}
              className="w-full"
            />
          </label>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={answers.unresolvedTopic}
            onChange={(event) =>
              setAnswers((prev) => ({ ...prev, unresolvedTopic: event.target.checked }))
            }
          />
          Есть нерешённая тема
        </label>

        <label className="block text-sm">
          <span className="mb-1 block">Заметка</span>
          <textarea
            value={answers.note ?? ''}
            onChange={(event) => setAnswers((prev) => ({ ...prev, note: event.target.value }))}
            maxLength={500}
            className="w-full rounded border border-slate-200 bg-white p-2"
            rows={2}
          />
        </label>
      </div>

      {error && <div className="app-alert app-alert-error mt-3 text-sm">{error}</div>}

      <button
        type="button"
        onClick={() => {
          void submit();
        }}
        disabled={loading || submitting}
        className="app-btn-primary mt-4 px-3 py-2 text-sm disabled:opacity-60"
      >
        {submitting ? 'Сохраняем...' : current ? 'Обновить check-in' : 'Сохранить check-in'}
      </button>

      {current && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="app-panel-soft app-panel-soft-solid p-3">
              <div className="app-muted text-xs">Готовность</div>
              <div className="font-semibold">{Math.round(current.readiness.score * 100)}%</div>
            </div>
            <div className="app-panel-soft app-panel-soft-solid p-3">
              <div className="app-muted text-xs">Усталость</div>
              <div className="font-semibold">{Math.round(current.fatigue.score * 100)}%</div>
            </div>
          </div>
          <InsightsList items={current.insights} pairId={pairId} />
        </div>
      )}
    </div>
  );
}
