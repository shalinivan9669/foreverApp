'use client';

import { useCallback, useEffect, useState } from 'react';
import { checkinsApi } from '@/client/api/checkins.api';
import {
  weeklyCyclesApi,
  type CurrentWeeklyCycleDTO,
} from '@/client/api/weeklyCycles.api';
import type {
  PairState,
  PairWeeklyCheckInSummaryDTO,
} from '@/client/api/types';
import WeeklyCheckInCard from '@/components/checkins/WeeklyCheckInCard';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
import ErrorView from '@/components/ui/ErrorView';

type PairWeeklyCheckInPanelProps = {
  pairId: string;
  pairStatus: PairState;
  onSummaryChanged?: () => void | Promise<void>;
};

type PairSignal = CurrentWeeklyCycleDTO['pair']['signals'][number];

const SIGNAL_LABELS: Record<PairSignal['key'], string> = {
  connection: 'Тепло и контакт',
  tension: 'Напряжение',
  recovery: 'Восстановление',
  resource: 'Ритм и ресурс',
};

const SIGNAL_COPY: Record<
  PairSignal['key'],
  Record<PairSignal['status'], string>
> = {
  connection: {
    LOW: 'Контакта в этом цикле ощущается меньше.',
    STEADY: 'Контакт в этом цикле выглядит устойчивым.',
    HIGH: 'В этом цикле заметно больше тепла и контакта.',
    MIXED: 'Опыт контакта в этом цикле ощущается по-разному.',
  },
  tension: {
    LOW: 'Напряжение в этом цикле невысокое.',
    STEADY: 'Напряжение остаётся в умеренном диапазоне.',
    HIGH: 'В этом цикле стоит бережно снизить нагрузку.',
    MIXED: 'Напряжение в этом цикле ощущается по-разному.',
  },
  recovery: {
    LOW: 'Для восстановления сейчас может не хватать пространства.',
    STEADY: 'Ресурс на восстановление выглядит умеренным.',
    HIGH: 'В этом цикле есть хороший ресурс на восстановление.',
    MIXED: 'Потребность в восстановлении ощущается по-разному.',
  },
  resource: {
    LOW: 'Общий ресурс для дополнительной нагрузки сейчас ограничен.',
    STEADY: 'Ритм недели выглядит посильным.',
    HIGH: 'В этом цикле есть ресурс для небольшого совместного шага.',
    MIXED: 'Готовность к следующему шагу ощущается по-разному.',
  },
};

const HINT_COPY: Record<PairSignal['nextStepHint'], string> = {
  CHECK_IN_TOGETHER: 'Подойдёт короткая спокойная сверка без давления.',
  CHOOSE_LOW_EFFORT: 'Лучше выбрать мягкий формат с небольшой нагрузкой.',
  MAKE_ROOM_FOR_RECOVERY: 'Сейчас полезнее оставить пространство для отдыха.',
  KEEP_CURRENT_RHYTHM: 'Можно сохранить текущий бережный ритм.',
};

function SignalCard({ signal }: { signal: PairSignal }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
      <div className="text-sm font-semibold">{SIGNAL_LABELS[signal.key]}</div>
      <p className="app-muted mt-1 text-sm">{SIGNAL_COPY[signal.key][signal.status]}</p>
      <p className="mt-2 text-xs text-slate-600">{HINT_COPY[signal.nextStepHint]}</p>
    </div>
  );
}

export default function PairWeeklyCheckInPanel({
  pairId,
  pairStatus,
  onSummaryChanged,
}: PairWeeklyCheckInPanelProps) {
  return (
    <PairWeeklyCheckInPanelSession
      key={pairId}
      pairId={pairId}
      pairStatus={pairStatus}
      onSummaryChanged={onSummaryChanged}
    />
  );
}

function PairWeeklyCheckInPanelSession({
  pairId,
  pairStatus,
  onSummaryChanged,
}: PairWeeklyCheckInPanelProps) {
  const [summary, setSummary] = useState<PairWeeklyCheckInSummaryDTO | null>(null);
  const [cycle, setCycle] = useState<CurrentWeeklyCycleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiErrorState | null>(null);

  const fetchSummary = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        checkinsApi.getPairWeeklySummary(pairId, {}, signal),
        weeklyCyclesApi.getCurrent(pairId, signal),
      ]),
    [pairId]
  );

  const loadSummary = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      return fetchSummary(signal)
        .then(([result, currentCycle]) => {
          if (!signal?.aborted) {
            setSummary(result);
            setCycle(currentCycle);
          }
        })
        .catch((caughtError: Error | null) => {
          const normalized =
            caughtError instanceof Error
              ? caughtError
              : new Error('Не удалось загрузить статус еженедельной отметки.');
          if (!signal?.aborted) setError(toUiErrorState(normalized));
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [fetchSummary]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchSummary(controller.signal)
      .then(([result, currentCycle]) => {
        if (!controller.signal.aborted) {
          setSummary(result);
          setCycle(currentCycle);
        }
      })
      .catch((caughtError: Error | null) => {
        const normalized =
          caughtError instanceof Error
            ? caughtError
            : new Error('Не удалось загрузить статус еженедельной отметки.');
        if (!controller.signal.aborted) setError(toUiErrorState(normalized));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchSummary]);

  const handleSubmitted = useCallback(async () => {
    await Promise.all([
      loadSummary(),
      Promise.resolve(onSummaryChanged?.()),
    ]);
  }, [loadSummary, onSummaryChanged]);

  const peerName = summary?.peer.username?.trim() || 'Партнёр';
  const pairDataStatus = cycle?.pair.dataStatus;
  const currentCompletion = cycle?.currentUser.completionStatus;
  const peerCompletion = cycle?.peer.completionStatus;
  const pairSignals = cycle?.pair.signals ?? [];
  const statusLabel =
    pairDataStatus === 'ENOUGH'
      ? 'Сводка готова'
      : pairDataStatus === 'INSUFFICIENT'
        ? 'Недостаточно данных'
        : pairDataStatus === 'PARTIAL'
          ? 'Ожидаем второй ответ'
          : pairDataStatus === 'EXPIRED'
            ? 'Цикл завершён'
          : 'Ожидает ответов';

  return (
    <div className="space-y-3">
      <div className="app-panel app-panel-solid p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Еженедельная отметка</h2>
            <p className="app-muted mt-1 text-sm">
              Короткая сверка состояния пары по ответам этой недели.
            </p>
          </div>
          {summary && cycle && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {statusLabel}
            </span>
          )}
        </div>

        {loading && !summary && (
          <div className="app-muted mt-4 text-sm" role="status">Загружаем статус отметки...</div>
        )}

        {error && (
          <div className="mt-4">
            <ErrorView error={error} onRetry={() => void loadSummary()} />
          </div>
        )}

        {summary && cycle && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                <div className="font-medium">
                  {currentCompletion === 'SKIPPED'
                    ? 'Вы пропустили этот цикл'
                    : currentCompletion === 'EXPIRED'
                      ? 'Цикл завершён без вашего ответа'
                      : currentCompletion === 'SUBMITTED'
                        ? 'Вы заполнили отметку'
                        : 'Вы ещё не заполнили отметку'}
                </div>
                <p className="app-muted mt-1">
                  {currentCompletion === 'SKIPPED'
                    ? 'Пропуск не ухудшает состояние пары и не раскрывает причину.'
                    : currentCompletion === 'EXPIRED'
                      ? 'Цикл завершён; ответ задним числом не требуется.'
                    : currentCompletion === 'SUBMITTED'
                    ? 'Ваш ответ уже учтён в сводке этой недели.'
                    : 'Заполните короткую проверку состояния, чтобы обновить сводку пары.'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                <div className="font-medium">
                  {peerName}:{' '}
                  {peerCompletion === 'SKIPPED'
                    ? 'пропущено'
                    : peerCompletion === 'EXPIRED'
                      ? 'цикл завершён'
                      : peerCompletion === 'SUBMITTED'
                        ? 'заполнено'
                        : 'ещё не заполнено'}
                </div>
                <p className="app-muted mt-1">
                  {peerCompletion === 'SKIPPED'
                    ? 'Причина пропуска остаётся личной.'
                    : peerCompletion === 'EXPIRED'
                      ? 'Цикл завершён без раскрытия личных данных участника.'
                    : peerCompletion === 'SUBMITTED'
                    ? 'Ответ учтён без показа индивидуальных значений и личной заметки.'
                    : 'Сводка станет точнее после второго ответа.'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-3">
                <h3 className="font-semibold">Сводка пары</h3>
                <p className="app-muted mt-1 text-sm">
                  {pairDataStatus === 'ENOUGH'
                    ? 'Показаны только качественные общие сигналы. По ним нельзя восстановить индивидуальный ответ.'
                    : pairDataStatus === 'PARTIAL'
                      ? 'Пока ответил один участник. Общие сигналы появятся только после второго ответа.'
                      : pairDataStatus === 'INSUFFICIENT'
                        ? 'Общих данных недостаточно для осторожной сводки. Индивидуальные ответы остаются личными.'
                        : 'Общие сигналы появятся после отметок обоих участников.'}
                </p>
              </div>
              {pairSignals.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {pairSignals.map((signal) => (
                    <SignalCard key={signal.key} signal={signal} />
                  ))}
                </div>
              ) : (
                <div className="app-alert app-alert-rate text-sm">
                  Точные значения и ответы каждого участника остаются личными.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {pairStatus === 'ended' ? (
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          Пара завершена, поэтому новая еженедельная отметка недоступна. Сводка прошлых ответов остаётся видимой.
        </div>
      ) : (
        <WeeklyCheckInCard
          pairId={pairId}
          cycleStatus={currentCompletion}
          onSubmitted={handleSubmitted}
          onCycleChanged={handleSubmitted}
        />
      )}
    </div>
  );
}
