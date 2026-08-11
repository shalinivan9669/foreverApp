'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  pairHistoryApi,
  type PairHistoryItemDTO,
  type PairHistorySignalDTO,
} from '@/client/api/pairHistory.api';
import { usePair } from '@/client/hooks/usePair';
import ErrorView from '@/components/ui/ErrorView';

const HISTORY_LIMIT = 12;

const ACTIVITY_STATUS_LABELS: Record<
  Extract<PairHistoryItemDTO, { kind: 'activity' }>['status'],
  string
> = {
  completed_success: 'Завершена',
  completed_partial: 'Завершена частично',
  failed: 'Не подошла',
  expired: 'Срок завершён',
  cancelled: 'Отменена',
};

const CYCLE_STATUS_LABELS: Record<
  Extract<PairHistoryItemDTO, { kind: 'cycle' }>['status'],
  string
> = {
  partial: 'Ожидает второго ответа',
  complete: 'Итог открыт для пары',
  insufficient: 'Недостаточно данных',
};

const SIGNAL_LABELS: Record<PairHistorySignalDTO['key'], string> = {
  connection: 'Близость',
  tension: 'Напряжение',
  recovery: 'Восстановление',
  resource: 'Ресурс',
};

const SIGNAL_STATUS_LABELS: Record<PairHistorySignalDTO['status'], string> = {
  LOW: 'ниже обычного',
  STEADY: 'стабильно',
  HIGH: 'выше обычного',
  MIXED: 'ощущается по-разному',
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export default function ProfileHistoryTab() {
  const router = useRouter();
  const {
    pairId,
    loading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = usePair();
  const [items, setItems] = useState<PairHistoryItemDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedPairId, setLoadedPairId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const hasCurrentHistory = pairId !== null && loadedPairId === pairId;
  const visibleItems = hasCurrentHistory ? items : [];
  const visibleNextCursor = hasCurrentHistory ? nextCursor : null;
  const visibleError = hasCurrentHistory ? error : null;
  const loading = pairId !== null && !hasCurrentHistory;

  useEffect(() => {
    if (!pairId) return;

    const controller = new AbortController();
    void pairHistoryApi
      .list(pairId, { limit: HISTORY_LIMIT, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Не удалось загрузить историю. Попробуйте ещё раз.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedPairId(pairId);
      });

    return () => controller.abort();
  }, [loadAttempt, pairId]);

  const loadMore = async () => {
    if (!pairId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await pairHistoryApi.list(pairId, {
        cursor: nextCursor,
        limit: HISTORY_LIMIT,
      });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setError('Не удалось загрузить следующую часть истории.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="app-muted text-xs uppercase tracking-[0.16em]">Для вашей пары</p>
          <h1 className="text-xl font-semibold">История</h1>
        </div>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <section className="app-panel app-panel-solid space-y-2 p-4">
        <h2 className="font-semibold">Что здесь видно</h2>
        <p className="app-muted text-sm">
          Только общие итоги циклов и активностей. Личные записи и ответы партнёра
          здесь не публикуются.
        </p>
      </section>

      {(pairLoading || loading) && (
        <div className="app-panel app-panel-solid p-4" aria-live="polite">
          <p className="app-muted">Загружаем историю…</p>
        </div>
      )}

      {!pairLoading && pairError && (
        <ErrorView
          error={pairError}
          onRetry={() => void refetchPair()}
          onAuthRequired={() => router.push('/')}
        />
      )}

      {!pairLoading && !pairError && !pairId && (
        <div className="app-panel app-panel-solid space-y-3 p-4">
          <h2 className="font-semibold">История появится после создания пары</h2>
          <p className="app-muted text-sm">
            Пригласите партнёра, чтобы проходить недельные циклы и выбирать активности.
          </p>
          <Link href="/invite" className="app-btn-primary inline-flex px-4 py-2 text-sm text-white">
            Создать приглашение
          </Link>
        </div>
      )}

      {visibleError && (
        <div className="app-panel app-panel-solid border border-rose-300/40 p-4" role="alert">
          <p className="text-sm">{visibleError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadedPairId(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="app-btn-secondary mt-3 px-3 py-2 text-sm"
          >
            Повторить
          </button>
        </div>
      )}

      {!loading && pairId && visibleItems.length === 0 && !visibleError && (
        <div className="app-panel app-panel-solid p-4">
          <h2 className="font-semibold">История пока пуста</h2>
          <p className="app-muted mt-1 text-sm">
            Здесь появятся завершённые активности и итоги недельных циклов.
          </p>
        </div>
      )}

      {visibleItems.length > 0 && (
        <ol className="space-y-3" aria-label="История пары">
          {visibleItems.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="app-panel app-panel-solid p-4">
              {item.kind === 'cycle' ? (
                <article className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="app-muted text-xs">{formatDate(item.date)}</p>
                      <h2 className="font-semibold">Недельный цикл</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {CYCLE_STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  {item.summary.signals.length > 0 ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {item.summary.signals.map((signal) => (
                        <li key={signal.key} className="app-panel-soft rounded-xl p-3 text-sm">
                          <span className="font-medium">{SIGNAL_LABELS[signal.key]}:</span>{' '}
                          <span className="app-muted">{SIGNAL_STATUS_LABELS[signal.status]}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="app-muted text-sm">
                      Качественный итог откроется, когда данных будет достаточно.
                    </p>
                  )}
                </article>
              ) : (
                <article className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="app-muted text-xs">{formatDate(item.date)}</p>
                      <h2 className="font-semibold">{item.title}</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {ACTIVITY_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <p className="app-muted text-sm">
                    {item.feedbackSubmitted
                      ? 'Обратная связь оставлена'
                      : 'Обратной связи пока нет'}
                  </p>
                </article>
              )}
            </li>
          ))}
        </ol>
      )}

      {visibleNextCursor && (
        <button
          type="button"
          className="app-btn-secondary w-full px-4 py-2 text-sm disabled:opacity-60"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
    </main>
  );
}
