'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkinsApi } from '@/client/api/checkins.api';
import type {
  PairState,
  PairWeeklyCheckInSummaryDTO,
} from '@/client/api/types';
import WeeklyCheckInCard from '@/components/checkins/WeeklyCheckInCard';

type PairWeeklyCheckInPanelProps = {
  pairId: string;
  pairStatus: PairState;
  onSummaryChanged?: () => void | Promise<void>;
};

const DIVERGENCE_THRESHOLD = 0.3;

const formatPercent = (value?: number): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : '—';

function Metric({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
      <div className="app-muted text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold">{formatPercent(value)}</div>
    </div>
  );
}

export default function PairWeeklyCheckInPanel({
  pairId,
  pairStatus,
  onSummaryChanged,
}: PairWeeklyCheckInPanelProps) {
  const [summary, setSummary] = useState<PairWeeklyCheckInSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await checkinsApi.getPairWeeklySummary(pairId, {}, signal);
        if (!signal?.aborted) setSummary(result);
      } catch {
        if (!signal?.aborted) {
          setError('Не удалось загрузить статус weekly check-in.');
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [pairId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const divergenceMessages = useMemo(() => {
    const divergence = summary?.pair.divergence;
    if (!divergence) return [];

    const messages: string[] = [];
    if ((divergence.fatigue ?? 0) >= DIVERGENCE_THRESHOLD) {
      messages.push(
        'Есть заметное расхождение по усталости. Один партнёр чувствует себя более уставшим — лучше выбрать лёгкую активность.'
      );
    }
    if ((divergence.readiness ?? 0) >= DIVERGENCE_THRESHOLD) {
      messages.push(
        'Есть заметное расхождение по готовности. Перед активностью лучше коротко сверить ожидания.'
      );
    }
    if ((divergence.closeness ?? 0) >= DIVERGENCE_THRESHOLD) {
      messages.push(
        'Ощущение близости на этой неделе различается. Спокойный короткий разговор поможет лучше понять друг друга.'
      );
    }
    if ((divergence.irritation ?? 0) >= DIVERGENCE_THRESHOLD) {
      messages.push(
        'Уровень раздражения ощущается по-разному. Лучше выбрать мягкий формат без давления.'
      );
    }
    return messages;
  }, [summary]);

  const handleSubmitted = useCallback(async () => {
    await Promise.all([
      loadSummary(),
      Promise.resolve(onSummaryChanged?.()),
    ]);
  }, [loadSummary, onSummaryChanged]);

  const peerName = summary?.peer.username?.trim() || 'Партнёр';
  const statusLabel =
    summary?.pair.status === 'complete'
      ? 'Оба заполнили'
      : summary?.pair.status === 'divergent'
        ? 'Есть расхождение'
        : summary?.pair.status === 'partial'
          ? 'Заполнено частично'
          : 'Ожидает ответов';

  return (
    <div className="space-y-3">
      <div className="app-panel app-panel-solid p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Weekly check-in недели</h2>
            <p className="app-muted mt-1 text-sm">
              Короткая сверка состояния пары по ответам этой недели.
            </p>
          </div>
          {summary && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {statusLabel}
            </span>
          )}
        </div>

        {loading && !summary && (
          <div className="app-muted mt-4 text-sm">Загружаем статус check-in...</div>
        )}

        {error && !summary && (
          <div className="app-alert app-alert-error mt-4 text-sm">
            <div>{error}</div>
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="app-btn-secondary mt-3 px-3 py-2 text-sm"
            >
              Повторить
            </button>
          </div>
        )}

        {summary && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                <div className="font-medium">
                  {summary.currentUser.submitted
                    ? 'Вы заполнили check-in'
                    : 'Вы ещё не заполнили check-in'}
                </div>
                <p className="app-muted mt-1">
                  {summary.currentUser.submitted
                    ? 'Ваш ответ уже учтён в сводке этой недели.'
                    : 'Заполните короткую проверку состояния, чтобы обновить сводку пары.'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                <div className="font-medium">
                  {peerName}: {summary.peer.submitted ? 'заполнено' : 'ещё не заполнено'}
                </div>
                <p className="app-muted mt-1">
                  {summary.peer.submitted
                    ? 'Ответ партнёра учтён без показа личной заметки.'
                    : 'Сводка станет точнее после второго ответа.'}
                </p>
              </div>
            </div>

            {summary.pair.submittedCount > 0 && (
              <div className="mt-4">
                <div className="mb-3">
                  <h3 className="font-semibold">Сводка пары</h3>
                  <p className="app-muted mt-1 text-sm">
                    {summary.pair.bothSubmitted
                      ? 'Оба заполнили check-in — показатели рассчитаны по двум свежим ответам.'
                      : 'Пока ответил один участник. Данных мало, поэтому сводка предварительная.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Готовность" value={summary.pair.readiness} />
                  <Metric label="Усталость" value={summary.pair.fatigue} />
                  <Metric label="Близость" value={summary.pair.closeness} />
                  <Metric label="Раздражение" value={summary.pair.irritation} />
                </div>
                {summary.pair.unresolvedTopicCount > 0 && (
                  <div className="app-alert app-alert-rate mt-3 text-sm">
                    По ответам этой недели есть нерешённые темы. Лучше выбрать спокойный формат разговора.
                  </div>
                )}
                {divergenceMessages.length > 0 && (
                  <div className="app-alert app-alert-rate mt-3 space-y-2 text-sm">
                    {divergenceMessages.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {pairStatus === 'ended' ? (
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          Пара завершена, поэтому новый weekly check-in недоступен. Сводка прошлых ответов остаётся видимой.
        </div>
      ) : (
        <WeeklyCheckInCard pairId={pairId} onSubmitted={handleSubmitted} />
      )}
    </div>
  );
}
