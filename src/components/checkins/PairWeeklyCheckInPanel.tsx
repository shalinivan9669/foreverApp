'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findNotificationHistoryItem } from '@/client/api/notificationHistory';
import type { PairHistoryCycleItemDTO } from '@/client/api/pairHistory.api';
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
import { useRefreshOnReturn } from '@/client/hooks/useRefreshOnReturn';

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
  const params = useSearchParams();
  return (
    <PairWeeklyCheckInPanelSession
      key={`${pairId}:${params.toString()}`}
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
  const params = useSearchParams();
  const targetCycleId = params.get('cycleId');
  const targetCycleKey = params.get('cycleKey');
  const targetAction = params.get('action');
  const [pastCycle, setPastCycle] = useState<PairHistoryCycleItemDTO | null>(null);
  const [pastLoading, setPastLoading] = useState(true);
  const [pastError, setPastError] = useState<UiErrorState | null>(null);
  const [pastAttempt, setPastAttempt] = useState(0);
  const targetRef = useRef<HTMLDivElement>(null);
  const summaryVersion = useRef(0);
  const [summary, setSummary] = useState<PairWeeklyCheckInSummaryDTO | null>(null);
  const [cycle, setCycle] = useState<CurrentWeeklyCycleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiErrorState | null>(null);
  const historicalTarget = Boolean(targetCycleId && cycle && targetCycleId !== cycle.cycleId);

  useEffect(() => {
    if (!historicalTarget || !targetCycleKey || pairStatus !== 'active') return;
    const controller = new AbortController();
    void findNotificationHistoryItem(pairId, 'cycle', targetCycleKey, controller.signal)
      .then((item) => { if (!controller.signal.aborted) { setPastCycle(item?.kind === 'cycle' ? item : null); setPastError(null); } })
      .catch((failure: Error) => { if (!controller.signal.aborted) setPastError(toUiErrorState(failure)); })
      .finally(() => { if (!controller.signal.aborted) setPastLoading(false); });
    return () => controller.abort();
  }, [historicalTarget, pairId, pairStatus, targetCycleKey, pastAttempt]);

  useEffect(() => {
    if (!targetAction || loading || (historicalTarget && pastLoading)) return;
    const target = targetRef.current;
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [targetAction, targetCycleId, loading, pastLoading, historicalTarget]);

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
      const version = ++summaryVersion.current;
      const isCurrent = () => !signal?.aborted && version === summaryVersion.current;
      setLoading(true);
      setError(null);
      return fetchSummary(signal)
        .then(([result, currentCycle]) => {
          if (isCurrent()) {
            setSummary(result);
            setCycle(currentCycle);
          }
        })
        .catch((caughtError: Error | null) => {
          const normalized =
            caughtError instanceof Error
              ? caughtError
              : new Error('Не удалось загрузить статус еженедельной отметки.');
          if (isCurrent()) {
            const nextError = toUiErrorState(normalized);
            setError(nextError);
            if ([401, 403, 404].includes(nextError.status)) { setSummary(null); setCycle(null); }
          }
        })
        .finally(() => {
          if (isCurrent()) setLoading(false);
        });
    },
    [fetchSummary]
  );

  useEffect(() => {
    const controller = new AbortController();
    const version = ++summaryVersion.current;
    const isCurrent = () => !controller.signal.aborted && version === summaryVersion.current;
    void fetchSummary(controller.signal)
      .then(([result, currentCycle]) => {
        if (isCurrent()) {
          setSummary(result);
          setCycle(currentCycle);
        }
      })
      .catch((caughtError: Error | null) => {
        const normalized =
          caughtError instanceof Error
            ? caughtError
            : new Error('Не удалось загрузить статус еженедельной отметки.');
        if (isCurrent()) setError(toUiErrorState(normalized));
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => { summaryVersion.current += 1; controller.abort(); };
  }, [fetchSummary]);

  const handleSubmitted = useCallback(async () => {
    await Promise.all([
      loadSummary(),
      Promise.resolve(onSummaryChanged?.()),
    ]);
  }, [loadSummary, onSummaryChanged]);
  useRefreshOnReturn(async () => { await loadSummary(); }, !loading && Boolean(cycle?.currentUser.completionStatus === 'SUBMITTED' || cycle?.currentUser.completionStatus === 'SKIPPED'));

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

  if (historicalTarget) {
    return <div ref={targetRef} tabIndex={-1} className="app-panel p-5 scroll-mt-4">
      <h2 className="text-lg font-semibold">Цикл из уведомления завершён</h2>
      <p className="app-muted mt-2 text-sm">Ответ задним числом не требуется. Здесь показано состояние именно прежнего цикла.</p>
      {pastLoading && targetCycleKey && pairStatus === 'active' ? <p role="status" className="mt-3">Ищем сводку этого цикла...</p> : pastError ? <ErrorView error={pastError} onRetry={() => setPastAttempt((value) => value + 1)} /> : pastCycle ? <>
        <p className="mt-3 font-medium">{pastCycle.status === 'complete' ? 'Общая сводка готова' : 'Общих данных для полной сводки недостаточно'}</p>
        <p className="app-muted text-sm">{new Date(pastCycle.date).toLocaleDateString('ru-RU')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{pastCycle.summary.signals.map((signal) => <div className="app-panel-soft p-3" key={signal.key}><h3 className="font-medium">{SIGNAL_LABELS[signal.key]}</h3><p className="app-muted mt-1 text-sm">{SIGNAL_COPY[signal.key][signal.status]}</p></div>)}</div>
      </> : <p className="mt-3" role="status">Сводка этой записи отсутствует или недоступна. Личные ответы не раскрываются.</p>}
      <Link href={`/pair/${encodeURIComponent(pairId)}?action=check-in#weekly-checkin`} className="app-btn-secondary mt-4 inline-flex">Перейти к текущему циклу</Link>
    </div>;
  }

  return (
    <div ref={targetRef} tabIndex={-1} className="space-y-3 scroll-mt-4">
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
          <button type="button" disabled={loading} onClick={() => void loadSummary()} className="app-btn-secondary px-3 py-2 text-sm">Обновить ответы недели</button>
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

      {pairStatus !== 'active' ? (
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          {pairStatus === 'paused' ? 'Пара на паузе: новые совместные ответы сейчас недоступны.' : 'Пара завершена, поэтому новая еженедельная отметка недоступна.'}
        </div>
      ) : !loading && !error && cycle && !['SUBMITTED', 'SKIPPED', 'EXPIRED'].includes(currentCompletion ?? '') ? (
        <WeeklyCheckInCard
          pairId={pairId}
          cycleStatus={currentCompletion}
          onSubmitted={handleSubmitted}
          onCycleChanged={handleSubmitted}
        />
      ) : null}
    </div>
  );
}
